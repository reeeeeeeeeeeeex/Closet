import type { CapacitorConfig } from "@capacitor/cli";
const config: CapacitorConfig = {
  appId: "app.newcloset.android", appName: "New Closet", webDir: "dist/mobile",
  server: { androidScheme: "https", errorPath: "webview-update.html" },
  android: { allowMixedContent: false, webContentsDebuggingEnabled: false, minWebViewVersion: 124 },
};
export default config;
