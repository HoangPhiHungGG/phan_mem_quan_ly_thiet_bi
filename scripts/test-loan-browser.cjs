// Run from the repository root after building the API. Uses a disposable database.
const { createRequire } = require("node:module");
const requireProject = createRequire(process.cwd() + "/package.json");
const { spawn } = require("node:child_process");
const { mkdtempSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { randomBytes, createHash } = require("node:crypto");
const mongoose = requireProject("mongoose");
const { NestFactory } = requireProject("@nestjs/core");
const { ValidationPipe } = requireProject("@nestjs/common");
const { getConnectionToken } = requireProject("@nestjs/mongoose");
const database =
  "pmqltb_loan_browser_" + new mongoose.Types.ObjectId().toHexString();
process.env.CORS_ORIGINS = "http://localhost:3100";
process.env.MONGODB_URI = `mongodb://127.0.0.1:27017/${database}?replicaSet=rs0&directConnection=true`;
const { AppModule } = requireProject("./apps/api/dist/app.module.js");
const { ALL_PERMISSIONS } = requireProject(
  "./apps/api/dist/identity/identity.schemas.js",
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let app, connection, chrome, next, ws;
const errors = [];
const assert = (value, message) => {
  if (!value) throw Error(message);
};
async function main() {
  app = await NestFactory.create(AppModule, { logger: ["error"] });
  app.enableCors({ origin: "http://localhost:3100", credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  connection = app.get(getConnectionToken());
  const user = await connection.model("User").create({
    employeeCode: "UITEST",
    employeeCodeNormalized: "UITEST",
    email: "ui@example.test",
    emailNormalized: "ui@example.test",
    displayName: "Người giao UI",
    passwordHash: "unused",
    status: "ACTIVE",
  });
  const role = await connection
    .model("Role")
    .create({ code: "UI_TEST", name: "UI Test", permissions: ALL_PERMISSIONS });
  await connection.model("RoleAssignment").create({
    userId: user._id,
    roleId: role._id,
    scope: {
      departmentMode: "ALL_DEPARTMENTS",
      warehouseMode: "ALL_WAREHOUSES",
    },
  });
  const token = randomBytes(32).toString("hex"),
    csrf = randomBytes(32).toString("hex");
  const hash = (v) => createHash("sha256").update(v).digest("hex");
  await connection.model("AuthSession").create({
    userId: user._id,
    tokenHash: hash(token),
    csrfHash: hash(csrf),
    expiresAt: new Date(Date.now() + 3600000),
  });
  const wh = await connection
    .model("Warehouse")
    .create({ code: "UI-WH", name: "Kho kiểm thử UI" });
  const dept = await connection
    .model("Department")
    .create({ code: "UI-DEPT", name: "Bộ phận UI" });
  const keeper = await connection
    .model("Keeper")
    .create({ displayName: "Người nhận UI", departmentId: dept._id });
  const device = await connection.model("Device").create({
    assetCode: "UI-LAPTOP",
    serial: "UI-SERIAL",
    warehouseId: wh._id,
  });
  const device2 = await connection
    .model("Device")
    .create({ assetCode: "UI-MONITOR", warehouseId: wh._id });
  const device3 = await connection
    .model("Device")
    .create({
      assetCode: "UI-CAMERA",
      serial: "UI-CAMERA-SERIAL",
      warehouseId: wh._id,
    });
  await connection.model("Device").create([
    { assetCode: "UI-BROKEN", warehouseId: wh._id, techCondition: "BROKEN" },
    { assetCode: "UI-LOST", warehouseId: wh._id, usageStatus: "LOST" },
    {
      assetCode: "UI-ASSIGNED",
      warehouseId: wh._id,
      usageStatus: "IN_USE",
      keeperId: keeper._id,
    },
  ]);
  await app.listen(3101, "127.0.0.1");
  next = spawn(
    process.execPath,
    [requireProject.resolve("next/dist/bin/next"), "dev", "-p", "3100"],
    {
      cwd: process.cwd() + "/apps/web",
      env: {
        ...process.env,
        NEXT_PUBLIC_API_URL: "http://localhost:3101",
        NEXT_DIST_DIR: ".next-loan-test",
      },
      stdio: ["ignore", "ignore", "pipe"],
    },
  );
  next.stderr.on("data", (d) => {
    if (d.toString().includes("Error")) errors.push(d.toString().slice(0, 500));
  });
  for (let i = 0; i < 60; i++) {
    try {
      await fetch("http://localhost:3100/muon-tra");
      break;
    } catch {
      await sleep(500);
    }
  }
  chrome = spawn(
    process.env.CHROME_BINARY ||
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    [
      "--headless=new",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-gpu",
      "--remote-debugging-port=9227",
      "--user-data-dir=" + mkdtempSync(tmpdir() + "/loan-chrome-"),
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  let targets;
  for (let i = 0; i < 30; i++) {
    try {
      targets = await (await fetch("http://127.0.0.1:9227/json")).json();
      break;
    } catch {
      await sleep(200);
    }
  }
  assert(targets, "Chrome unavailable");
  ws = new WebSocket(
    targets.find((t) => t.type === "page").webSocketDebuggerUrl,
  );
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? p.reject(Error(msg.error.message)) : p.resolve(msg.result);
    } else if (msg.method === "Runtime.exceptionThrown")
      errors.push(msg.params.exceptionDetails.text);
  };
  const cdp = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const n = ++id;
      pending.set(n, { resolve, reject });
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  const evaluate = async (expression) => {
    const result = await cdp("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (result.exceptionDetails)
      throw Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const wait = async (expression) => {
    for (let i = 0; i < 80; i++) {
      if (await evaluate(expression)) return;
      await sleep(150);
    }
    throw Error(
      "UI wait timed out: " +
        expression +
        "\n" +
        (await evaluate("document.body.innerText")),
    );
  };
  const click = async (text, scope = "document") => {
    await wait(
      `Array.from(${scope}?.querySelectorAll('button')??[]).some(b=>b.textContent.trim()===${JSON.stringify(text)}&&!b.disabled)`,
    );
    await evaluate(
      `(()=>{const b=Array.from(${scope}.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!b)throw Error('Button missing: '+${JSON.stringify(text)});b.click();})()`,
    );
    await sleep(150);
  };
  const field = async (label, value, index = 0) => {
    await evaluate(
      `(()=>{const l=Array.from(document.querySelectorAll('form label')).filter(l=>l.firstChild?.textContent.trim()===${JSON.stringify(label)})[${index}];if(!l)throw Error('Label missing: '+${JSON.stringify(label)});const el=l.querySelector('input,select,textarea');const proto=el.tagName==='SELECT'?HTMLSelectElement.prototype:el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`,
    );
    await sleep(150);
  };
  await cdp("Runtime.enable");
  await cdp("Network.enable");
  for (const [name, value] of [
    ["pmqltb_session", token],
    ["pmqltb_csrf", csrf],
  ])
    await cdp("Network.setCookie", {
      name,
      value,
      url: "http://localhost:3100",
      path: "/",
    });
  const date = (offset = 0) => {
    const value = new Date();
    value.setUTCDate(value.getUTCDate() + offset);
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(value);
  };
  const closeDetail = () =>
    evaluate(
      `document.querySelector('dialog[open] button[aria-label="Đóng"]').click()`,
    );
  const toggleReturn = async (index) => {
    await evaluate(
      `document.querySelectorAll('form input[type="checkbox"]')[${index}].click()`,
    );
    await sleep(150);
  };
  const printCheck = async (
    button,
    heading,
    expected,
    suffix,
    scope = "document",
  ) => {
    await evaluate(
      `window.__originalOpen??=window.open;window.open=function(...args){const w=window.__originalOpen.apply(window,args);window.__printWindow=w;if(w)w.print=()=>{window.__printed=true;};return w;};`,
    );
    await click(button, scope);
    await wait(
      `window.__printWindow?.document.body?.innerText.includes(${JSON.stringify(heading)})`,
    );
    const text = await evaluate(`window.__printWindow.document.body.innerText`);
    for (const value of expected)
      assert(text.includes(value), "Print missing " + value);
    assert(
      await evaluate(
        `window.__printWindow.document.querySelectorAll('script').length===0`,
      ),
      "Unsafe print HTML",
    );
    const targets = await (await fetch("http://127.0.0.1:9227/json")).json();
    const target = targets.find(
      (item) => item.title.startsWith("LOAN-") && item.title.includes(suffix),
    );
    assert(target, "Print window missing");
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.onopen = resolve;
      socket.onerror = reject;
    });
    const pdf = await new Promise((resolve, reject) => {
      socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.id === 1)
          message.error
            ? reject(Error(message.error.message))
            : resolve(message.result.data);
      };
      socket.send(
        JSON.stringify({
          id: 1,
          method: "Page.printToPDF",
          params: { preferCSSPageSize: true, printBackground: true },
        }),
      );
    });
    assert(Buffer.from(pdf, "base64").length > 1000, "Empty PDF");
    require("node:fs").writeFileSync(
      "/private/tmp/loan-" +
        (suffix === "Phiếu mượn" ? "borrow" : "return") +
        "-check.pdf",
      Buffer.from(pdf, "base64"),
    );
    socket.close();
    await evaluate(`window.__printWindow.close()`);
    console.log("PASS browser: " + suffix + " contents, escaping, actual PDF");
  };
  await cdp("Page.navigate", { url: "http://localhost:3100/muon-tra" });
  await wait(`document.body.innerText.includes('Tạo phiếu mượn')`);
  await click("Tạo phiếu mượn");
  assert(
    !(await evaluate(
      `document.querySelector('form').innerText.includes('Kho nhận')||document.querySelector('form').innerText.includes('Kho xuất')`,
    )),
    "Loan still uses transfer fields",
  );
  await field("Kho quản lý thiết bị *", String(wh._id));
  await field("Người mượn *", String(keeper._id));
  assert(
    await evaluate(
      `Array.from(document.querySelectorAll('form label')).find(l=>l.textContent.startsWith('Bộ phận')).querySelector('select').value===${JSON.stringify(String(dept._id))}`,
    ),
    "Department not filled",
  );
  await field("Ngày mượn *", date(-5));
  await field("Hạn trả *", date(-2));
  await field("Mục đích mượn *", "Mượn công tác <script>không chạy</script>");
  await field("Ghi chú", "Ghi chú mượn UI");
  await wait(`document.querySelector('form').innerText.includes('UI-LAPTOP')`);
  assert(
    !(await evaluate(
      `document.querySelector('form').innerText.includes('UI-BROKEN')||document.querySelector('form').innerText.includes('UI-LOST')||document.querySelector('form').innerText.includes('UI-ASSIGNED')`,
    )),
    "Unavailable devices included",
  );
  await field("Thiết bị 1 *", String(device._id));
  await field("Phụ kiện đi kèm", "Sạc và túi UI");
  await click("Lưu");
  await wait(`document.body.innerText.includes('Tạo phiếu mượn thành công')`);
  assert(
    (await connection.model("Device").findById(device._id)).usageStatus ===
      "IN_STOCK",
    "Saved loan locked device",
  );
  console.log(
    "PASS browser: create one device, correct fields, auto department, available filtering, pending save",
  );
  await click("Xem chi tiết");
  await wait(
    `document.querySelector('dialog[open]')?.innerText.includes('Sạc và túi UI')`,
  );
  await closeDetail();
  await click("Sửa");
  await field("Ghi chú", "Đã sửa phiếu mượn UI");
  await click("Thêm thiết bị");
  await field("Thiết bị 2 *", String(device2._id));
  await click("Thêm thiết bị");
  await field("Thiết bị 3 *", String(device3._id));
  await field("Tình trạng khi giao *", "OTHER", 2);
  await field("Mô tả tình trạng khác *", "Vết xước thân camera");
  await click("Lưu");
  await wait(
    `document.body.innerText.includes('Cập nhật phiếu mượn thành công')`,
  );
  assert(
    (await connection.model("OperationDocument").countDocuments()) === 1,
    "Edit duplicated loan",
  );
  assert(
    (await connection.model("OperationDocument").findOne()).lines.length === 3,
    "Missing devices after edit",
  );
  console.log(
    "PASS browser: detail and edit to three devices with custom handover condition",
  );
  await click("Tạo phiếu mượn");
  await field("Kho quản lý thiết bị *", String(wh._id));
  await field("Người mượn *", String(keeper._id));
  await field("Hạn trả *", date(1));
  await field("Mục đích mượn *", "Phiếu để xóa");
  await wait(`document.querySelector('form').innerText.includes('UI-LAPTOP')`);
  await field("Thiết bị 1 *", String(device._id));
  await click("Lưu");
  await wait(`document.body.innerText.includes('Tạo phiếu mượn thành công')`);
  await click("Xóa");
  await click("Hủy", 'document.querySelector("dialog[open]")');
  assert(
    (await connection.model("OperationDocument").countDocuments()) === 2,
    "Delete on cancel",
  );
  await click("Xóa");
  await click("Xóa", 'document.querySelector("dialog[open]")');
  await wait(`document.body.innerText.includes('Xóa phiếu mượn thành công')`);
  assert(
    (await connection.model("OperationDocument").countDocuments()) === 1,
    "Delete failed",
  );
  console.log("PASS browser: pending delete and cancellation");
  await click("Hoàn tất giao");
  await click("Hủy", 'document.querySelector("dialog[open]")');
  assert(
    (await connection.model("Device").findById(device._id)).usageStatus ===
      "IN_STOCK",
    "Cancelled handover updated stock",
  );
  await click("Hoàn tất giao");
  await click("Xác nhận giao", 'document.querySelector("dialog[open]")');
  await wait(
    `document.body.innerText.includes('Hoàn tất giao thiết bị thành công')`,
  );
  assert(
    (await connection
      .model("Device")
      .countDocuments({ usageStatus: "LENT" })) === 3,
    "Handover missing devices",
  );
  await wait(`document.body.innerText.includes('Quá hạn 2 ngày')`);
  assert(
    !(await evaluate(
      `Array.from(document.querySelectorAll('table button')).some(b=>['Sửa','Xóa','Hoàn tất giao'].includes(b.textContent.trim()))`,
    )),
    "Handed loan editable",
  );
  console.log("PASS browser: handover, cancel, overdue, state locks");
  await printCheck(
    "In phiếu mượn",
    "PHIẾU MƯỢN THIẾT BỊ",
    [
      "UI-LAPTOP",
      "UI-MONITOR",
      "UI-CAMERA",
      "Sạc và túi UI",
      "Vết xước thân camera",
      "<script>không chạy</script>",
    ],
    "Phiếu mượn",
  );
  await click("Trả thiết bị", 'document.querySelector("table")');
  await wait(`document.body.innerText.includes('Ghi nhận trả ·')`);
  assert(
    await evaluate(
      `Array.from(document.querySelectorAll('form label')).find(l=>l.textContent.startsWith('Người nhận lại')).querySelector('input').value==='Người giao UI'`,
    ),
    "Return receiver not current user",
  );
  await toggleReturn(1);
  await toggleReturn(2);
  await field("Ghi chú lần trả", "Lần trả đầu UI");
  await click("Xác nhận trả");
  await click("Hủy", 'document.querySelector("dialog[open]")');
  assert(
    (await connection.model("OperationDocument").findOne()).status === "ACTIVE",
    "Cancelled return updated loan",
  );
  await click("Xác nhận trả");
  await click("Xác nhận trả", 'document.querySelector("dialog[open]")');
  await wait(
    `document.querySelector('dialog[open]')?.innerText.includes('Lần trả 1')`,
  );
  let op = await connection.model("OperationDocument").findOne();
  assert(
    op.status === "PARTIALLY_RETURNED" && op.returnHistory.length === 1,
    "Partial return state wrong",
  );
  assert(
    (await connection.model("Device").findById(device._id)).usageStatus ===
      "IN_STOCK",
    "Good return unavailable",
  );
  await printCheck(
    "In biên bản trả",
    "BIÊN BẢN TRẢ THIẾT BỊ",
    ["UI-LAPTOP", "Lần trả đầu UI", "Người giao UI", "Tốt"],
    "Biên bản trả",
    'document.querySelector("dialog[open]")',
  );
  await closeDetail();
  console.log(
    "PASS browser: partial return, cancellation, history and current receiver",
  );
  await click("Trả thiết bị", 'document.querySelector("table")');
  await wait(
    `document.querySelectorAll('form input[type="checkbox"]').length===2`,
  );
  await toggleReturn(1);
  await field("Tình trạng khi trả *", "BROKEN");
  await field("Ghi chú khi trả", "Màn hình hư UI");
  await click("Xác nhận trả");
  await click("Xác nhận trả", 'document.querySelector("dialog[open]")');
  await wait(
    `document.querySelector('dialog[open]')?.innerText.includes('Lần trả 2')`,
  );
  assert(
    (await connection.model("Device").findById(device2._id)).usageStatus ===
      "REPAIRING",
    "Broken return made available",
  );
  await closeDetail();
  await click("Trả thiết bị", 'document.querySelector("table")');
  await wait(
    `document.querySelectorAll('form input[type="checkbox"]').length===1`,
  );
  await field("Tình trạng khi trả *", "LOST");
  await field("Ghi chú khi trả *", "Mất camera trong chuyến đi");
  await click("Xác nhận trả");
  await click("Xác nhận trả", 'document.querySelector("dialog[open]")');
  await wait(
    `document.querySelector('dialog[open]')?.innerText.includes('Lần trả 3')`,
  );
  op = await connection.model("OperationDocument").findOne();
  assert(
    op.status === "RETURNED" && op.returnHistory.length === 3,
    "Final return/history incorrect",
  );
  assert(
    (await connection.model("Device").findById(device3._id)).usageStatus ===
      "LOST",
    "Lost device made available",
  );
  await closeDetail();
  console.log(
    "PASS browser: subsequent damaged/lost returns, preserved three batches, returned state",
  );
  await click("Mượn thiết bị");
  await cdp("Page.reload");
  await wait(
    `document.body.innerText.includes('Đã trả')&&document.body.innerText.includes('LOAN-')`,
  );
  assert(
    !(await evaluate(
      `Array.from(document.querySelectorAll('table button')).some(b=>['Sửa','Xóa','Trả thiết bị'].includes(b.textContent.trim()))`,
    )),
    "Reload unlocked completed loan",
  );
  await click("Xem chi tiết");
  await wait(
    `document.querySelector('dialog[open]')?.innerText.includes('Lần trả 3')`,
  );
  await closeDetail();
  await click("Tạo phiếu mượn");
  await field("Kho quản lý thiết bị *", String(wh._id));
  await wait(`document.querySelector('form').innerText.includes('UI-LAPTOP')`);
  assert(
    !(await evaluate(
      `document.querySelector('form').innerText.includes('UI-MONITOR')||document.querySelector('form').innerText.includes('UI-CAMERA')`,
    )),
    "Broken/lost devices available for a new loan",
  );
  console.log(
    "PASS browser: reload, detail history, damaged/lost availability filtering",
  );
  assert(errors.length === 0, "Browser/backend errors: " + errors.join("\n"));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    ws?.close();
    chrome?.kill();
    next?.kill();
    if (connection?.name === database) await connection.dropDatabase();
    await app?.close();
  });
