import { createRoot } from "react-dom/client";
import { App } from "@capacitor/app";
import Closet from "../components/closet";
import { I18nProvider } from "../lib/i18n/provider";
import { savedClientLocale, tr } from "../lib/i18n/core";
import { installClosetClient } from "../lib/closet-client";
import { installSyncClient } from "../lib/sync-client";
import { androidClient } from "./client";
import { bootstrap } from "./store";
import { pair,unpair,synchronize,syncStatus } from "./sync";
import "../app/globals.css";
import "./mobile.css";
installClosetClient(androidClient);
installSyncClient({pair,unpair,sync:synchronize,async status(owner){const {binding,dirty,syncing}=await syncStatus(owner);return {paired:!!binding,url:binding?.url,lastSync:binding?.lastSync,dirty,syncing,conflicts:binding?.conflicts||[],pending:!!binding?.pending};}});
const root=createRoot(document.getElementById('root')!);
const locale = savedClientLocale();
document.documentElement.lang = locale;
bootstrap().then(state=>{
  root.render(<I18nProvider initialLocale={locale} persistLocally><Closet appearance="android" profile={state.profiles.find(p=>p.id===state.current)!}/></I18nProvider>);
}).catch(error=>root.render(<main style={{padding:24}}><h1>{tr("本地资料暂时无法打开")}</h1><p>{tr(String(error.message||error))}</p><button onClick={()=>location.reload()}>{tr("重试")}</button></main>));
App.addListener('backButton',()=>{
  const dialog=document.querySelector('[role="dialog"], [role="alertdialog"]');
  if(dialog){document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true}));return;}
  const handled=new CustomEvent('closet-back',{cancelable:true});if(!window.dispatchEvent(handled))return;
  void App.minimizeApp();
});
