import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const outputDir = path.join(projectRoot, "out");
const serverScript = path.join(
  projectRoot,
  "scripts",
  "serve-static.mjs",
);

const presets = [
  "workbench-result",
  "workbench-audit",
  "scenarios",
  "layering-p1",
  "layering-p2",
  "ratios-special",
  "turnover-psi",
  "calibration",
  "console-alerts",
];
const viewports = [
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
];

function findBrowser() {
  const candidates =
    process.platform === "win32"
      ? [
          path.join(
            process.env["PROGRAMFILES(X86)"] ?? "",
            "Microsoft",
            "Edge",
            "Application",
            "msedge.exe",
          ),
          path.join(
            process.env.PROGRAMFILES ?? "",
            "Microsoft",
            "Edge",
            "Application",
            "msedge.exe",
          ),
          path.join(
            process.env.LOCALAPPDATA ?? "",
            "Microsoft",
            "Edge",
            "Application",
            "msedge.exe",
          ),
          path.join(
            process.env.PROGRAMFILES ?? "",
            "Google",
            "Chrome",
            "Application",
            "chrome.exe",
          ),
        ]
      : process.platform === "darwin"
        ? [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
          ]
        : [
            "/usr/bin/google-chrome",
            "/usr/bin/google-chrome-stable",
            "/usr/bin/microsoft-edge",
            "/usr/bin/chromium",
            "/usr/bin/chromium-browser",
          ];
  return candidates.find((candidate) => candidate && existsSync(candidate));
}

async function getFreePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 4176;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForServer(url) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The preview process is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`静态预览服务未能启动：${url}`);
}

function dumpDom(browserPath, url, viewport) {
  const profileDir = mkdtempSync(
    path.join(tmpdir(), "sony-shot-check-"),
  );
  const args = [
    "--headless=new",
    "--disable-gpu",
    "--disable-extensions",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-sync",
    "--no-first-run",
    "--no-default-browser-check",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    "--disable-background-timer-throttling",
    `--window-size=${viewport.width},${viewport.height + (process.platform === "win32" ? 92 : 0)}`,
    "--run-all-compositor-stages-before-draw",
    "--virtual-time-budget=5000",
    `--user-data-dir=${profileDir}`,
    "--dump-dom",
    url,
  ];

  return new Promise((resolve, reject) => {
    const child = spawn(browserPath, args, {
      cwd: projectRoot,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`浏览器检查超时：${url}`));
    }, 25_000);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (code) => {
      clearTimeout(timeout);
      rmSync(profileDir, { recursive: true, force: true });
      if (code !== 0) {
        reject(
          new Error(
            `浏览器退出码 ${code}：${stderr.trim() || url}`,
          ),
        );
        return;
      }
      resolve(stdout);
    });
  });
}

function decodeAttribute(value) {
  return value
    .replaceAll("&quot;", "\"")
    .replaceAll("&amp;", "&")
    .replaceAll("&#39;", "'");
}

function inspectDump(html) {
  const opening = html.match(/<html\b[^>]*>/i)?.[0] ?? "";
  const ready = /data-shot-ready="true"/.test(opening);
  const passed = /data-shot-status="pass"/.test(opening);
  const issues =
    opening.match(/data-shot-issues="([^"]*)"/i)?.[1] ??
    "页面未返回布局报告";
  return {
    ready,
    passed,
    issues: decodeAttribute(issues),
  };
}

async function main() {
  if (!existsSync(path.join(outputDir, "index.html"))) {
    throw new Error("缺少 out/index.html，请先运行 pnpm build。");
  }
  const browserPath = findBrowser();
  if (!browserPath) {
    throw new Error(
      "未找到 Edge/Chrome/Chromium，无法执行截图布局自检。",
    );
  }

  const port = await getFreePort();
  const preview = spawn(
    process.execPath,
    [serverScript, outputDir, String(port)],
    {
      cwd: projectRoot,
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"],
    },
  );
  const baseUrl = `http://127.0.0.1:${port}/`;
  const failures = [];

  try {
    await waitForServer(baseUrl);
    for (const viewport of viewports) {
      for (const preset of presets) {
        const url = `${baseUrl}?shot=1&preset=${encodeURIComponent(preset)}`;
        let report = {
          ready: false,
          passed: false,
          issues: "页面未返回布局报告",
        };
        for (let attempt = 0; attempt < 3 && !report.ready; attempt += 1) {
          const html = await dumpDom(browserPath, url, viewport);
          report = inspectDump(html);
          if (!report.ready) {
            await new Promise((resolve) => setTimeout(resolve, 250));
          }
        }
        const label = `${viewport.width}×${viewport.height} ${preset}`;
        if (report.ready && report.passed) {
          console.log(`PASS ${label}`);
        } else {
          failures.push(`${label}: ${report.issues}`);
          console.error(`FAIL ${label}: ${report.issues}`);
        }
      }
    }
  } finally {
    preview.kill();
  }

  if (failures.length > 0) {
    throw new Error(
      `截图布局自检失败 ${failures.length}/${presets.length * viewports.length}`,
    );
  }
  console.log(
    `全部通过：${presets.length} 个 preset × ${viewports.length} 个分辨率。`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
