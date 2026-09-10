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
  "pmqltb_warehouse_browser_" + new mongoose.Types.ObjectId().toHexString();
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
  const type = await connection
    .model("DeviceType")
    .create({ code: "LAPTOP", name: "Laptop" });
  const model = await connection.model("ItemModel").create({
    code: "LAT5420",
    name: "Laptop Dell Latitude 5420",
    manufacturer: "Dell",
    deviceTypeId: type._id,
  });
  const device = await connection.model("Device").create({
    assetCode: "UI-LAPTOP",
    serial: "UI-SERIAL",
    warehouseId: wh._id,
    modelId: model._id,
    deviceTypeId: type._id,
    usageStatus: "LENT",
    keeperId: keeper._id,
  });
  await connection.model("Device").create({
    assetCode: "UI-ASSIGNED",
    warehouseId: wh._id,
    modelId: model._id,
    usageStatus: "IN_USE",
    keeperId: keeper._id,
  });
  await connection.model("Device").create(
    Array.from({ length: 23 }, (_, i) => ({
      assetCode: `UI-STOCK-${String(i).padStart(2, "0")}`,
      warehouseId: wh._id,
      modelId: model._id,
    })),
  );
  const otherWh = await connection
    .model("Warehouse")
    .create({ code: "OTHER", name: "Kho khác" });
  await connection
    .model("Device")
    .create({ assetCode: "OTHER-DEVICE", warehouseId: otherWh._id });
  const unit = await connection
    .model("Unit")
    .create({ code: "CAI", name: "Cai" });
  const parts = await connection.model("Part").create(
    Array.from({ length: 25 }, (_, i) => ({
      code: `UI-PART-${String(i).padStart(2, "0")}`,
      name: `Linh kiện ${i}`,
      trackingMode: "QUANTITY",
      unitId: unit._id,
      deviceTypeId: type._id,
      minQty: 2,
    })),
  );
  await connection.model("InventoryBalance").create(
    parts.map((part, i) => ({
      partId: part._id,
      warehouseId: wh._id,
      quantity: i === 0 ? 0 : i === 1 ? 2 : 10,
    })),
  );
  const loan = await connection.model("OperationDocument").create({
    code: "LOAN-UI-001",
    type: "LOAN",
    status: "ACTIVE",
    sourceWarehouseId: wh._id,
    receiverKeeperId: keeper._id,
    receiverDepartmentId: dept._id,
    operationDate: new Date(),
    completedAt: new Date(),
    completedBy: user._id,
    createdBy: user._id,
    reason: "Kiểm tra chi tiết kho",
    lines: [
      {
        kind: "DEVICE",
        deviceId: device._id,
        quantity: 1,
        conditionOut: "GOOD",
        handedOverAt: new Date(),
      },
    ],
  });
  await connection.model("InventoryTransaction").create(
    parts.map((part, i) => ({
      partId: part._id,
      warehouseId: wh._id,
      quantity: i === 0 ? 0 : i === 1 ? 2 : 10,
      type: "OPENING",
      createdBy: user._id,
    })),
  );
  const before = JSON.stringify(
    await connection
      .collection("inventory_balances")
      .find({})
      .sort({ _id: 1 })
      .toArray(),
  );
  await app.listen(3101, "127.0.0.1");
  next = spawn(
    process.execPath,
    [requireProject.resolve("next/dist/bin/next"), "dev", "-p", "3100"],
    {
      cwd: process.cwd() + "/apps/web",
      env: {
        ...process.env,
        NEXT_PUBLIC_API_URL: "http://localhost:3101",
        NEXT_DIST_DIR: ".next-warehouse-test",
      },
      stdio: ["ignore", "ignore", "pipe"],
    },
  );
  next.stderr.on("data", (d) => {
    if (d.toString().includes("Error")) errors.push(d.toString().slice(0, 500));
  });
  for (let i = 0; i < 60; i++) {
    try {
      await fetch("http://localhost:3100/dang-nhap");
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
      "--user-data-dir=" + mkdtempSync(tmpdir() + "/warehouse-chrome-"),
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
      `(()=>{const l=Array.from(document.querySelectorAll('label')).filter(l=>l.firstChild?.textContent.trim()===${JSON.stringify(label)})[${index}];if(!l)throw Error('Label missing: '+${JSON.stringify(label)});const el=l.querySelector('input,select,textarea');const proto=el.tagName==='SELECT'?HTMLSelectElement.prototype:el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`,
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
  const section = (name) =>
    `document.querySelector('[data-section="${name}"]')`;
  const rows = (name) => `${section(name)}?.querySelectorAll('tbody tr')`;
  await cdp("Page.navigate", { url: `http://localhost:3100/kho/${wh._id}` });
  await wait(
    `${rows("devices")}?.length===20 && ${rows("parts")}?.length===20 && ${rows("history")}?.length===20`,
  );
  let body = await evaluate("document.body.innerText");
  assert(
    body.includes("Kho kiểm thử UI") && body.includes("UI-WH"),
    "Warehouse identity missing",
  );
  assert(
    body.includes("25 thiết bị") &&
      body.includes("25 loại linh kiện") &&
      body.includes("1 sắp hết · 1 hết hàng"),
    "Summary counts incorrect",
  );
  assert(!body.includes("OTHER-DEVICE"), "Foreign warehouse device visible");
  for (const [label, value] of [
    ["Tổng thiết bị", "25"],
    ["Thiết bị khả dụng", "23"],
    ["Đang sử dụng", "1"],
    ["Đang cho mượn", "1"],
    ["Tổng loại linh kiện", "25"],
    ["Sắp hết / Hết hàng", "2"],
  ]) {
    assert(
      await evaluate(
        `Array.from(document.querySelectorAll('p')).some(p=>p.textContent===${JSON.stringify(label)} && p.parentElement.querySelector('p.text-3xl')?.textContent===${JSON.stringify(value)})`,
      ),
      "Summary card incorrect: " + label,
    );
  }
  console.log(
    "PASS browser: warehouse identity, six summaries, warehouse scoping, server pagination",
  );
  await click("Sau", section("devices"));
  await wait(`${rows("devices")}?.length===5`);
  await field("Tìm thiết bị", "UI-SERIAL");
  await wait(
    `${rows("devices")}?.length===1 && ${section("devices")}.innerText.includes('UI-LAPTOP')`,
  );
  body = await evaluate(`${section("devices")}.innerText`);
  assert(
    body.includes("Laptop Dell Latitude 5420") &&
      body.includes("Dell") &&
      body.includes("Người nhận UI") &&
      body.includes("Đang cho mượn") &&
      body.includes("Tốt"),
    "Device detail or custody incorrect",
  );
  assert(
    await evaluate(
      `${section("devices")}.querySelector('tbody a').getAttribute('href')===${JSON.stringify(`/thiet-bi/${device._id}`)}`,
    ),
    "Device detail link incorrect",
  );
  await field("Loại thiết bị", String(type._id));
  await field("Trạng thái sử dụng", "LENT");
  await wait(`${rows("devices")}?.length===1`);
  await field("Trạng thái sử dụng", "AVAILABLE");
  await wait(
    `${section("devices")}.innerText.includes('Không có dữ liệu phù hợp.')`,
  );
  console.log(
    "PASS browser: serial search, type/status filters, model/condition/keeper and device link",
  );
  await click("Sau", section("parts"));
  await wait(`${rows("parts")}?.length===5`);
  await field("Trạng thái tồn", "LOW");
  await wait(
    `${rows("parts")}?.length===1 && ${section("parts")}.innerText.includes('UI-PART-01')`,
  );
  assert(
    (await evaluate(`${section("parts")}.innerText`)).includes("Cái"),
    "Vietnamese unit label missing",
  );
  await field("Trạng thái tồn", "OUT");
  await wait(
    `${rows("parts")}?.length===1 && ${section("parts")}.innerText.includes('UI-PART-00')`,
  );
  await field("Trạng thái tồn", "");
  await field("Tìm linh kiện", "UI-PART-02");
  await wait(
    `${rows("parts")}?.length===1 && ${section("parts")}.innerText.includes('Còn hàng')`,
  );
  await click("Xem lịch sử", section("parts"));
  await wait(
    `${rows("history")}?.length===1 && ${section("history")}.innerText.includes('UI-PART-02')`,
  );
  console.log(
    "PASS browser: part pagination/search, exact stock thresholds, units, per-part history",
  );
  await click("Bỏ lọc linh kiện", section("history"));
  await wait(`${rows("history")}?.length===20`);
  await click("Sau", section("history"));
  await wait(`${rows("history")}?.length===6`);
  await field("Tìm mã phiếu", "LOAN-UI-001");
  await wait(
    `${rows("history")}?.length===1 && ${section("history")}.innerText.includes('Mượn')`,
  );
  await click("Xem phiếu", section("history"));
  await wait(
    `document.querySelector('dialog[open]')?.innerText.includes('LOAN-UI-001')`,
  );
  assert(
    (
      await evaluate(`document.querySelector('dialog[open]').innerText`)
    ).includes("Kiểm tra chi tiết kho"),
    "Linked document detail incorrect",
  );
  await evaluate(
    `document.querySelector('dialog[open] button[aria-label="Đóng"]').click()`,
  );
  await field("Tìm mã phiếu", "");
  await field("Loại giao dịch", "LOAN");
  await wait(`${rows("history")}?.length===1`);
  await field("Từ ngày", "2099-01-01");
  await wait(
    `${section("history")}.innerText.includes('Không có dữ liệu phù hợp.')`,
  );
  console.log(
    "PASS browser: history pagination, document search/detail, transaction and date filters",
  );
  await cdp("Page.reload");
  await wait(
    `${rows("devices")}?.length===20 && ${rows("parts")}?.length===20 && ${rows("history")}?.length===20`,
  );
  await cdp("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const fs = require("node:fs");
  fs.writeFileSync(
    "/private/tmp/warehouse-desktop-check.png",
    Buffer.from(
      (await cdp("Page.captureScreenshot", { captureBeyondViewport: true }))
        .data,
      "base64",
    ),
  );
  await cdp("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await sleep(300);
  assert(
    await evaluate(
      "document.documentElement.scrollWidth<=document.documentElement.clientWidth",
    ),
    "Mobile page has horizontal overflow outside tables",
  );
  for (const name of ["devices", "parts", "history"])
    assert(
      await evaluate(
        `${section(name)}.querySelector('table').parentElement.scrollWidth > ${section(name)}.querySelector('table').parentElement.clientWidth`,
      ),
      "Table lacks mobile horizontal scrolling: " + name,
    );
  fs.writeFileSync(
    "/private/tmp/warehouse-mobile-check.png",
    Buffer.from((await cdp("Page.captureScreenshot")).data, "base64"),
  );
  assert(
    before ===
      JSON.stringify(
        await connection
          .collection("inventory_balances")
          .find({})
          .sort({ _id: 1 })
          .toArray(),
      ),
    "Read page mutated stock balances",
  );
  assert(errors.length === 0, "Browser errors: " + errors.join("\n"));
  console.log(
    "PASS browser: reload preserves data, desktop/mobile rendering, no stock mutations or runtime errors",
  );
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
