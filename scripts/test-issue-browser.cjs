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
  "pmqltb_issue_browser_" + new mongoose.Types.ObjectId().toHexString();
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
  app = await NestFactory.create(AppModule, { logger: false });
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
  const unit = await connection
    .model("Unit")
    .create({ code: "CAI", name: "Cái" });
  const part = await connection.model("Part").create({
    code: "UI-RAM",
    name: "RAM UI",
    trackingMode: "QUANTITY",
    unitId: unit._id,
  });
  await connection
    .model("InventoryBalance")
    .create({ partId: part._id, warehouseId: wh._id, quantity: 10 });
  const device = await connection.model("Device").create({
    assetCode: "UI-LAPTOP",
    serial: "UI-SERIAL",
    warehouseId: wh._id,
  });
  const device2 = await connection
    .model("Device")
    .create({ assetCode: "UI-MONITOR", warehouseId: wh._id });
  const emptyWh = await connection
    .model("Warehouse")
    .create({ code: "EMPTY", name: "Kho trống" });
  const otherWh = await connection
    .model("Warehouse")
    .create({ code: "OTHER", name: "Kho khác" });
  await connection
    .model("Device")
    .create({ assetCode: "OTHER-DEVICE", warehouseId: otherWh._id });
  const model = await connection
    .model("ItemModel")
    .create({ code: "DELL5420", name: "Dell Latitude 5420" });
  await connection
    .model("Device")
    .updateOne({ _id: device._id }, { $set: { modelId: model._id } });
  await connection
    .model("Device")
    .create([
      {
        assetCode: "UNAVAILABLE-BROKEN",
        warehouseId: wh._id,
        techCondition: "BROKEN",
      },
      {
        assetCode: "UNAVAILABLE-KEEPER",
        warehouseId: wh._id,
        keeperId: keeper._id,
      },
      ...["IN_USE", "LENT", "LOST", "DISPOSED", "REPAIRING"].map(
        (usageStatus) => ({
          assetCode: `UNAVAILABLE-${usageStatus}`,
          warehouseId: wh._id,
          usageStatus,
        }),
      ),
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
        NEXT_DIST_DIR: ".next-issue-test",
      },
      stdio: ["ignore", "ignore", "pipe"],
    },
  );
  next.stderr.on("data", (d) => {
    if (d.toString().includes("Error")) errors.push(d.toString().slice(0, 500));
  });
  for (let i = 0; i < 60; i++) {
    try {
      await fetch("http://localhost:3100/cap-phat");
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
      "--user-data-dir=" + mkdtempSync(tmpdir() + "/issue-chrome-"),
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
  await cdp("Page.navigate", { url: "http://localhost:3100/cap-phat" });
  await wait(`document.body.innerText.includes('Tạo phiếu cấp phát')`);
  await click("Tạo phiếu cấp phát");
  const itemSelect = (index = 0) =>
    `Array.from(document.querySelectorAll('form label')).filter(l=>l.firstChild?.textContent==='Thiết bị / linh kiện *')[${index}].querySelector('select')`;
  assert(
    await evaluate(
      `${itemSelect()}.disabled && ${itemSelect()}.textContent.includes('Vui lòng chọn kho trước')`,
    ),
    "Missing warehouse must explain disabled picker",
  );
  await field("Kho xuất *", String(emptyWh._id));
  await wait(
    `${itemSelect()}.textContent.includes('Không có thiết bị khả dụng trong kho này')`,
  );
  assert(
    await evaluate(`!${itemSelect()}.disabled`),
    "Empty device picker disabled",
  );
  await field("Dòng 1 · Loại", "PART");
  await wait(
    `${itemSelect()}.textContent.includes('Không có linh kiện còn tồn trong kho này')`,
  );
  assert(
    await evaluate(`!${itemSelect()}.disabled`),
    "Empty part picker disabled",
  );
  await field("Dòng 1 · Loại", "DEVICE");
  await evaluate(
    `window.__realFetch=window.fetch;window.__failDevices=true;window.fetch=(url,init)=>String(url).includes('/api/devices?')&&window.__failDevices?Promise.reject(new Error('Injected network failure')):window.__realFetch(url,init)`,
  );
  await field("Kho xuất *", String(wh._id));
  await wait(
    `document.body.innerText.includes('Không thể tải danh sách thiết bị. Vui lòng thử lại.')`,
  );
  assert(
    await evaluate(`!${itemSelect()}.disabled`),
    "Failed API left picker disabled",
  );
  await evaluate(`window.__failDevices=false`);
  await click("Thử tải lại");
  await wait(`${itemSelect()}.textContent.includes('Dell Latitude 5420')`);
  assert(
    !(await evaluate(
      `${itemSelect()}.textContent.includes('UNAVAILABLE') || ${itemSelect()}.textContent.includes('OTHER-DEVICE')`,
    )),
    "Picker exposes unavailable or wrong-warehouse devices",
  );
  await field("Thiết bị / linh kiện *", String(device._id));
  assert(
    await evaluate(
      `Array.from(document.querySelectorAll('form label')).find(l=>l.firstChild?.textContent==='Mã tài sản / Serial').querySelector('input').value==='UI-LAPTOP / UI-SERIAL'`,
    ),
    "Asset/serial not filled",
  );
  await click("Thêm dòng");
  assert(
    !(await evaluate(`${itemSelect(1)}.textContent.includes('UI-LAPTOP')`)),
    "Duplicate device offered",
  );
  await field("Thiết bị / linh kiện *", String(device2._id), 1);
  await field("Dòng 1 · Loại", "PART");
  await wait(`${itemSelect()}.textContent.includes('RAM UI')`);
  await field("Thiết bị / linh kiện *", String(part._id));
  await field("Số lượng *", "11");
  await wait(
    `document.body.innerText.includes('Số lượng cấp phát vượt quá tồn kho hiện tại.')`,
  );
  assert(
    await evaluate(
      `${itemSelect(1)}.value===${JSON.stringify(String(device2._id))}`,
    ),
    "Changing row one changed row two",
  );
  await field("Kho xuất *", String(otherWh._id));
  await wait(`${itemSelect(1)}.textContent.includes('OTHER-DEVICE')`);
  assert(
    await evaluate(`${itemSelect()}.value==='' && ${itemSelect(1)}.value===''`),
    "Warehouse change retained selected items",
  );
  // Delay one warehouse response, then switch: stale responses must not replace the new warehouse.
  await evaluate(
    `window.fetch=(url,init)=>String(url).includes('/api/devices?')&&String(url).includes(${JSON.stringify(String(wh._id))})?new Promise(resolve=>setTimeout(resolve,800)).then(()=>window.__realFetch(url,init)):window.__realFetch(url,init)`,
  );
  await field("Kho xuất *", String(wh._id));
  assert(
    await evaluate(
      `!${itemSelect(1)}.disabled && ${itemSelect(1)}.textContent.includes('Đang tải thiết bị')`,
    ),
    "Loading must be explicit and keep picker enabled",
  );
  await field("Kho xuất *", String(otherWh._id));
  await sleep(1000);
  assert(
    await evaluate(
      `${itemSelect(1)}.textContent.includes('OTHER-DEVICE') && !${itemSelect(1)}.textContent.includes('UI-LAPTOP')`,
    ),
    "Stale response replaced current warehouse",
  );
  await evaluate(`window.fetch=window.__realFetch`);
  await click("Hủy", "document.querySelector('form')");
  console.log(
    "PASS browser: missing/empty warehouse, API error/retry/loading, correct availability, row independence, duplicate prevention, stock validation, warehouse/type resets and race cancellation",
  );
  await click("Tạo phiếu cấp phát");
  await field("Kho xuất *", String(wh._id));
  await field("Người nhận *", String(keeper._id));
  assert(
    await evaluate(
      `Array.from(document.querySelectorAll('form label')).find(l=>l.textContent.startsWith('Bộ phận nhận')).querySelector('select').value===${JSON.stringify(String(dept._id))}`,
    ),
    "Department not auto-filled",
  );
  await field(
    "Lý do / Nội dung cấp phát *",
    "Cấp laptop <script>không chạy</script>",
  );
  await field("Ghi chú", "Ghi chú thật UI");
  await wait(`document.querySelector('form').innerText.includes('UI-LAPTOP')`);
  await field("Thiết bị / linh kiện *", String(device._id));
  await click("Thêm dòng");
  await field("Dòng 2 · Loại", "PART");
  await wait(`document.querySelector('form').innerText.includes('RAM UI')`);
  await field("Thiết bị / linh kiện *", String(part._id), 1);
  await field("Số lượng *", "2", 1);
  await click("Lưu");
  await wait(
    `document.body.innerText.includes('Tạo phiếu cấp phát thành công')`,
  );
  console.log(
    "PASS browser: create mixed issue, auto department, list refresh",
  );
  await click("Xem chi tiết");
  await wait(`!!document.querySelector('dialog[open]')`);
  assert(
    await evaluate(
      `document.querySelector('dialog[open]').innerText.includes('Ghi chú thật UI')`,
    ),
    "Detail note missing",
  );
  await evaluate(
    `document.querySelector('dialog[open] button[aria-label="Đóng"]').click()`,
  );
  await click("Sửa");
  await wait(`document.body.innerText.includes('Sửa phiếu cấp phát')`);
  await field("Ghi chú", "Đã sửa UI");
  await click("Thêm dòng");
  await field("Thiết bị / linh kiện *", String(device2._id), 2);
  await click("Lưu");
  await wait(
    `document.body.innerText.includes('Cập nhật phiếu cấp phát thành công')`,
  );
  assert(
    (await connection.model("OperationDocument").countDocuments()) === 1,
    "Edit created another issue",
  );
  console.log("PASS browser: detail and edit/add line preserve issue");
  await click("Tạo phiếu cấp phát");
  await field("Kho xuất *", String(wh._id));
  await field("Người nhận *", String(keeper._id));
  await field("Lý do / Nội dung cấp phát *", "Phiếu để xóa");
  await wait(`document.querySelector('form').innerText.includes('UI-LAPTOP')`);
  await field("Thiết bị / linh kiện *", String(device._id));
  await click("Lưu");
  await wait(
    `document.body.innerText.includes('Tạo phiếu cấp phát thành công')`,
  );
  await click("Xóa");
  await wait(`!!document.querySelector('dialog[open]')`);
  assert(
    (await connection.model("OperationDocument").countDocuments()) === 2,
    "Deleted before confirmation",
  );
  await click("Hủy", 'document.querySelector("dialog[open]")');
  await click("Xóa");
  await click("Xóa", 'document.querySelector("dialog[open]")');
  await wait(
    `document.body.innerText.includes('Xóa phiếu cấp phát thành công')`,
  );
  assert(
    (await connection.model("OperationDocument").countDocuments()) === 1,
    "Delete failed",
  );
  console.log("PASS browser: delete confirmation and cancellation");
  await click("Hoàn tất");
  await click("Hủy", 'document.querySelector("dialog[open]")');
  assert(
    (await connection.model("InventoryBalance").findOne({ partId: part._id }))
      .quantity === 10,
    "Cancel mutated stock",
  );
  await click("Hoàn tất");
  await click("Xác nhận hoàn tất", 'document.querySelector("dialog[open]")');
  await wait(
    `document.body.innerText.includes('Hoàn tất phiếu cấp phát thành công')`,
  );
  assert(
    (await connection.model("InventoryBalance").findOne({ partId: part._id }))
      .quantity === 8,
    "Stock wrong",
  );
  assert(
    (await connection.model("Device").findById(device._id)).usageStatus ===
      "IN_USE",
    "Device not assigned",
  );
  assert(
    !(await evaluate(
      `Array.from(document.querySelectorAll('table button')).some(b=>['Sửa','Xóa','Hoàn tất'].includes(b.textContent.trim()))`,
    )),
    "Completed issue actions still editable",
  );
  console.log(
    "PASS browser: complete confirmation, asset/stock updates, locked actions",
  );
  await evaluate(
    `window.__originalOpen=window.open;window.open=function(...args){const w=window.__originalOpen.apply(window,args);window.__printWindow=w;if(w)w.print=()=>{window.__printed=true;};return w;};`,
  );
  await click("In");
  await wait(
    `window.__printWindow?.document.body?.innerText.includes('PHIẾU CẤP PHÁT')`,
  );
  const printed = await evaluate(
    `window.__printWindow.document.body.innerText`,
  );
  for (const expected of [
    "UI-LAPTOP",
    "UI-MONITOR",
    "RAM UI",
    "Người nhận UI",
    "Kho kiểm thử UI",
    "Đã sửa UI",
    "<script>không chạy</script>",
  ])
    assert(printed.includes(expected), "Print missing " + expected);
  assert(
    await evaluate(
      `window.__printWindow.document.querySelectorAll('script').length===0`,
    ),
    "Print HTML injection",
  );
  const printTargets = await (await fetch("http://127.0.0.1:9227/json")).json();
  const printTarget = printTargets.find((t) => t.title.startsWith("ISSUE-"));
  assert(printTarget, "Print target missing");
  const printSocket = new WebSocket(printTarget.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    printSocket.onopen = resolve;
    printSocket.onerror = reject;
  });
  const pdf = await new Promise((resolve, reject) => {
    printSocket.onmessage = (event) => {
      const result = JSON.parse(event.data);
      if (result.id === 1) {
        result.error
          ? reject(Error(result.error.message))
          : resolve(result.result.data);
      }
    };
    printSocket.send(
      JSON.stringify({
        id: 1,
        method: "Page.printToPDF",
        params: { preferCSSPageSize: true, printBackground: true },
      }),
    );
  });
  require("node:fs").writeFileSync(
    "/private/tmp/issue-print-check.pdf",
    Buffer.from(pdf, "base64"),
  );
  assert(Buffer.from(pdf, "base64").length > 1000, "Empty print PDF");
  printSocket.close();
  console.log(
    "PASS browser: correct escaped print popup and actual PDF rendering",
  );
  await cdp("Page.reload");
  await wait(
    `document.body.innerText.includes('Hoàn tất') && document.body.innerText.includes('ISSUE-')`,
  );
  assert(
    !(await evaluate(
      `Array.from(document.querySelectorAll('table button')).some(b=>b.textContent.trim()==='Sửa')`,
    )),
    "Reload lost final status",
  );
  console.log("PASS browser: reload persists completed state");
  assert(errors.length === 0, "Browser errors: " + errors.join("\n"));
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
