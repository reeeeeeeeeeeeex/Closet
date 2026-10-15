package app.newcloset.android

import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Test
import org.junit.Assert.*
import org.junit.runner.RunWith
import org.json.JSONObject
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import android.app.Activity
import android.app.Instrumentation
import android.content.Intent
import android.net.Uri
import android.provider.MediaStore
import android.util.Base64
import android.os.SystemClock
import android.view.MotionEvent
import java.io.File
import java.util.zip.ZipFile
import androidx.test.espresso.intent.Intents
import androidx.test.espresso.intent.Intents.intending
import androidx.test.espresso.intent.matcher.IntentMatchers.hasAction

@RunWith(AndroidJUnit4::class)
class ClosetInstrumentedTest {
    private fun eval(scenario:ActivityScenario<MainActivity>,script:String):String {
        val latch=CountDownLatch(1);var result="null"
        scenario.onActivity { it.bridge.webView.evaluateJavascript(script) { value -> result=value;latch.countDown() } }
        assertTrue("WebView evaluation timed out",latch.await(10,TimeUnit.SECONDS));return result
    }
    private fun runJs(scenario:ActivityScenario<MainActivity>,script:String):JSONObject {
        eval(scenario,"window.__closetTestResult=null;(async()=>{$script})().then(value=>window.__closetTestResult={ok:true,value},e=>window.__closetTestResult={ok:false,error:String(e.message||e)});true")
        repeat(300){val result=eval(scenario,"window.__closetTestResult");if(result!="null"){val parsed=JSONObject(result);assertTrue(parsed.optString("error"),parsed.getBoolean("ok"));return parsed};Thread.sleep(100)}
        throw AssertionError("Native call timed out")
    }
    private fun ready(scenario:ActivityScenario<MainActivity>,locale:String?="zh-CN"){
        repeat(150){
            if(eval(scenario,"!!(window.Capacitor && window.Capacitor.Plugins.ClosetStorage && document.querySelector('.android-bottom-nav button:not(:disabled)') && !document.querySelector('.loading-grid'))")=="true"){
                if(locale==null||eval(scenario,"document.documentElement.lang")==JSONObject.quote(locale))return
                eval(scenario,"localStorage.setItem('closet_locale',${JSONObject.quote(locale)});location.reload();true")
            }
            Thread.sleep(100)
        }
        throw AssertionError("App did not open offline: "+eval(scenario,"document.body.innerText"))
    }
    @Test fun languageSwitchPersistsOffline(){
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            ready(scenario,null)
            eval(scenario,"localStorage.removeItem('closet_locale');location.reload();true")
            scenario.recreate();ready(scenario,null)
            assertEquals("Default language",JSONObject.quote("en"),eval(scenario,"document.documentElement.lang"))
            runJs(scenario,"""
                const wait=async(test)=>{for(let i=0;i<100;i++){if(test())return;await new Promise(r=>setTimeout(r,50))}throw Error('Language UI timed out')};
                const nav=()=>[...document.querySelectorAll('.android-bottom-nav button')];
                if(nav().map(b=>b.textContent.trim()).join('|')!=='Wardrobe|Outfits|Calendar|You')throw Error('English navigation missing');
                nav().find(b=>b.textContent==='You').click();await wait(()=>document.querySelector('.android-my > .language-select select'));
                const n=window.Capacitor.Plugins.ClosetStorage,root=JSON.parse((await n.read({key:'root'})).value),before=(await n.read({key:'profile:'+root.current})).value;
                const select=document.querySelector('.android-my > .language-select select');select.value='zh-CN';select.dispatchEvent(new Event('change',{bubbles:true}));
                await wait(()=>document.documentElement.lang==='zh-CN'&&nav().at(-1).textContent==='我的');
                if(localStorage.getItem('closet_locale')!=='zh-CN'||!document.body.innerText.includes('数据与备份'))throw Error('Chinese preference not saved');
                if((await n.read({key:'profile:'+root.current})).value!==before)throw Error('Language switch rewrote wardrobe data');return true;
            """.trimIndent())
            scenario.recreate();ready(scenario,null)
            assertEquals("Chinese survives restart",JSONObject.quote("zh-CN"),eval(scenario,"document.documentElement.lang"))
            runJs(scenario,"""
                [...document.querySelectorAll('.android-bottom-nav button')].find(b=>b.textContent==='我的').click();
                for(let i=0;i<100&&!document.querySelector('.android-my > .language-select select');i++)await new Promise(r=>setTimeout(r,50));
                const select=document.querySelector('.android-my > .language-select select');select.value='en';select.dispatchEvent(new Event('change',{bubbles:true}));
                for(let i=0;i<100&&document.documentElement.lang!=='en';i++)await new Promise(r=>setTimeout(r,50));
                if(localStorage.getItem('closet_locale')!=='en'||!document.body.innerText.includes('Data and backups'))throw Error('English switch failed');return true;
            """.trimIndent())
            scenario.recreate();ready(scenario,null)
            assertEquals("English survives restart",JSONObject.quote("en"),eval(scenario,"document.documentElement.lang"))
        }
    }
    private fun loadClient(scenario:ActivityScenario<MainActivity>){
        val source=InstrumentationRegistry.getInstrumentation().context.assets.open("client-test.js").bufferedReader().use { it.readText() }
        eval(scenario,source+";true")
    }
    @Test fun modalViewportStability(){
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            ready(scenario,"en")
            // WebView 124 reports zero safe-area insets on this emulator. Substitute
            // device insets in the loaded CSS to cover edge-to-edge phone layouts.
            val safeTop=InstrumentationRegistry.getArguments().getString("safeAreaTop","24")!!.toInt()
            eval(scenario,"""
                (()=>{const insets={top:$safeTop,right:${if(safeTop>0)8 else 0},bottom:${if(safeTop>0)16 else 0},left:${if(safeTop>0)8 else 0}};
                const visit=rules=>{for(const rule of rules){if(rule.style)for(const property of Array.from(rule.style)){const value=rule.style.getPropertyValue(property);if(value.includes('env(safe-area-inset-'))rule.style.setProperty(property,value.replace(/env\(safe-area-inset-(top|right|bottom|left)(?:,[^)]*)?\)/g,(_,edge)=>insets[edge]+'px'),rule.style.getPropertyPriority(property));}if(rule.cssRules)visit(rule.cssRules)}};
                for(const sheet of document.styleSheets)visit(sheet.cssRules);return true})()
            """.trimIndent())
            val samples=mutableMapOf<String,JSONObject>()
            fun sample(label:String){
                val result=eval(scenario,"""
                    (()=>{const rect=s=>{const r=document.querySelector(s)?.getBoundingClientRect();return r?{x:r.x,y:r.y,width:r.width,height:r.height}:null};const b=getComputedStyle(document.body);return {scrollY,innerHeight,body:rect('body'),root:rect('#root'),app:rect('.android-app'),workspace:rect('.workspace'),nav:rect('.android-bottom-nav'),dialog:rect('[role=dialog]'),paddingTop:b.paddingTop,paddingBottom:b.paddingBottom,marginTop:b.marginTop,position:b.position,overflow:b.overflow,active:document.activeElement?.outerHTML.slice(0,250),viewport:{height:visualViewport.height,offsetTop:visualViewport.offsetTop,pageTop:visualViewport.pageTop}}})()
                """.trimIndent())
                val metrics=JSONObject(result)
                scenario.onActivity { metrics.put("nativeScroll",it.bridge.webView.scrollY);metrics.put("nativeY",it.bridge.webView.y);android.util.Log.i("ClosetViewport",label+" "+metrics.toString()) }
                samples[label]=metrics
            }
            fun tap(selector:String){
                val p=JSONObject(eval(scenario,"(()=>{const r=document.querySelector(${JSONObject.quote(selector)}).getBoundingClientRect();return {x:(r.x+r.width/2)*devicePixelRatio,y:(r.y+r.height/2)*devicePixelRatio}})()"))
                val origin=IntArray(2);scenario.onActivity { it.bridge.webView.getLocationOnScreen(origin) }
                val down=SystemClock.uptimeMillis()
                for(action in listOf(MotionEvent.ACTION_DOWN,MotionEvent.ACTION_UP)){val event=MotionEvent.obtain(down,SystemClock.uptimeMillis(),action,origin[0]+p.getDouble("x").toFloat(),origin[1]+p.getDouble("y").toFloat(),0);InstrumentationRegistry.getInstrumentation().sendPointerSync(event);event.recycle()}
                Thread.sleep(700)
            }
            sample("wardrobe-before");tap(".android-filter-trigger");sample("filter-open")
            tap(".android-filter-footer .android-primary");sample("filter-closed")
            tap(".android-bottom-nav button:nth-child(3)");sample("calendar-before")
            tap(".android-month-header > button:not([data-slot])");sample("month-open")
            tap(".month-jump-dialog [data-slot=dialog-close]");sample("month-closed")
            for(label in listOf("filter-open","month-open"))assertFalse("$label did not open a dialog",samples.getValue(label).isNull("dialog"))
            for(label in listOf("filter-closed","month-closed"))assertTrue("$label left a dialog open",samples.getValue(label).isNull("dialog"))
            for((before,after) in listOf("wardrobe-before" to "filter-open","wardrobe-before" to "filter-closed","calendar-before" to "month-open","calendar-before" to "month-closed")){
                val original=samples.getValue(before);val current=samples.getValue(after)
                for(element in listOf("app","nav"))for(axis in listOf("x","y","width"))assertEquals("$after moved $element.$axis: "+samples.toString(),original.getJSONObject(element).getDouble(axis),current.getJSONObject(element).getDouble(axis),1.0)
                for(value in listOf("scrollY","nativeScroll","nativeY"))assertEquals("$after changed $value",original.getDouble(value),current.getDouble(value),1.0)
            }
        }
    }
    @Test fun phoneModelAndMcpTools() {
        val modelAddress = InstrumentationRegistry.getArguments().getString("closetModelAddress") ?: return
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            ready(scenario); loadClient(scenario)
            runJs(scenario, """
                const c=ClosetTest,n=window.Capacitor.Plugins.ClosetStorage,root=await c.bootstrap(),owner=root.current;c.setProfileContext(owner);
                const request=async(path,data,method=data?'POST':'GET')=>{const response=await c.androidClient.request(path,{method,headers:{'X-Closet-Profile':owner},body:data?JSON.stringify(data):undefined});const json=await response.json();if(!response.ok)throw Error(json.error);return json};
                const state=await request('/api/closet'),canvas=document.createElement('canvas');canvas.width=96;canvas.height=128;const context=canvas.getContext('2d');context.fillStyle='#214f90';context.fillRect(0,0,96,128);
                const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png')),asset=await c.androidClient.uploadAsset(new File([blob],'native-ai.png',{type:'image/png'}),owner);
                const item=await request('/api/closet',{op:'save',collectionId:state.collectionId,kind:'item',data:{name:'AI native shirt',category:'top',color:'蓝',seasons:[],occasions:['work'],notes:'',asset:asset.hash,photos:[asset.hash],archived:false}});
                const settings={provider:'openai',baseUrl:${JSONObject.quote(modelAddress)},model:'fixture-vision',apiKey:'android-fixture-key',scopes:['read','photos','sizes','write']};
                const configured=await request('/api/ai/settings',settings);if(JSON.stringify(configured).includes('android-fixture-key')||configured.settings.apiKey!==undefined)throw Error('Model key crossed bridge');
                const stored=await n.read({key:'ai:'+owner});if(stored.value.includes('android-fixture-key')||!stored.value.includes('encryptedKey'))throw Error('Model key not encrypted');
                const before=new Uint8Array(await (await fetch(c.localAssetUrl(asset.hash,owner))).arrayBuffer());
                const chat=async()=>{const response=await c.androidClient.request('/api/ai/chat',{method:'POST',headers:{'X-Closet-Profile':owner},body:JSON.stringify({collectionId:state.collectionId,prompt:'看看我的照片',history:[]})});if(!response.ok)throw Error(await response.text());const events=(await response.text()).trim().split('\n').map(v=>JSON.parse(v));if(events.at(-1).type!=='answer'||!events.some(e=>e.type==='tool_result'&&e.imageCount===1))throw Error('Phone model loop failed: '+JSON.stringify(events));};
                await chat();await request('/api/ai/settings',{...settings,provider:'anthropic'});await chat();
                const mcp=await c.connectToolsMcp({collectionId:state.collectionId,scopes:settings.scopes},c.phoneTools(owner,state.collectionId,settings.scopes,new AbortController().signal));
                const args={requestId:crypto.randomUUID(),name:'AI phone outfit',itemIds:[item.id]};const first=await mcp.client.callTool({name:'create_outfit',arguments:args}),again=await mcp.client.callTool({name:'create_outfit',arguments:args});if(first.structuredContent.id!==again.structuredContent.id)throw Error('Phone write duplicated');
                await mcp.client.callTool({name:'plan_outfit',arguments:{requestId:crypto.randomUUID(),outfitId:first.structuredContent.id,date:'2026-10-15'}});await mcp.close();
                await request('/api/ai/settings',{...settings,scopes:['read']});let denied=false;try{await n.previewAsset({owner,hash:asset.hash,size:1024})}catch{denied=true}if(!denied)throw Error('Native photo permission bypass');
                const after=new Uint8Array(await (await fetch(c.localAssetUrl(asset.hash,owner))).arrayBuffer());if(before.length!==after.length||before.some((v,i)=>v!==after[i]))throw Error('Preview rewrote original');
                const saved=await request('/api/closet');if(saved.records.filter(r=>r.id===first.structuredContent.id).length!==1||!saved.records.some(r=>r.kind==='calendar'&&r.data.outfitId===first.structuredContent.id))throw Error('Local write missing');
                if(JSON.stringify(c.manifestFromState(saved)).includes('encryptedKey'))throw Error('Backup contains model credentials');
                await request('/api/ai/settings',settings);
                const my=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='我的');if(!my)throw Error('My navigation missing');my.click();
                for(let i=0;i<100&&!document.querySelector('.android-my-links');i++)await new Promise(r=>setTimeout(r,100));
                [...document.querySelectorAll('.android-my-links button')].find(b=>b.textContent.trim()==='穿搭灵感').click();
                for(let i=0;i<100&&!document.querySelector('#ai-chat-prompt');i++)await new Promise(r=>setTimeout(r,100));
                [...document.querySelectorAll('.ai-card > summary')].find(b=>b.textContent.includes('模型设置')).click();
                const field=document.querySelector('#ai-chat-prompt');if(!field)throw Error('Phone AI screen missing');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(field,'看看我的照片');field.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(r=>setTimeout(r,200));
                const send=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='发送');if(!send||send.disabled)throw Error('Phone AI send unavailable');send.click();
                for(let i=0;i<150&&!document.body.innerText.includes('手机本地 MCP 已读取真实照片');i++)await new Promise(r=>setTimeout(r,100));
                if(!document.body.innerText.includes('手机本地 MCP 已读取真实照片')||!document.body.innerText.includes('电脑无需运行'))throw Error('Phone AI UI did not complete: '+document.body.innerText);
                const snapshot={owner,recordIds:(await c.readDocument(owner)).value.replica.collections.flatMap(v=>v.records.map(r=>r.id)).sort(),encryptedKey:JSON.parse((await n.read({key:'ai:'+owner})).value).encryptedKey};const oldSnapshot=await n.read({key:'ai-upgrade-fixture'});await n.write({key:'ai-upgrade-fixture',expected:oldSnapshot.revision,value:JSON.stringify(snapshot)});
                return {owner,itemId:item.id,hash:asset.hash};
            """.trimIndent())
        }
    }
    @Test fun offlineAccountAndAllRecordTypes(){
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            ready(scenario);loadClient(scenario)
            runJs(scenario,"""
                const c=ClosetTest,root=await c.bootstrap(),originalOwner=root.current;let owner=originalOwner;
                const request=async(path,body)=>{const response=await c.androidClient.request(path,{method:body?'POST':'GET',headers:{'X-Closet-Profile':owner},body:body?JSON.stringify(body):undefined});const value=await response.json();if(!response.ok)throw Error(value.error);return value};
                const created=await request('/api/profiles',{action:'create',name:'Offline test '+Date.now()});owner=created.profile.id;c.setProfileContext(owner);
                const state=await request('/api/closet');if(state.records.length)throw Error('Account leaked records');
                const raw=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jrWQAAAAASUVORK5CYII='),x=>x.charCodeAt(0));
                const photo=await c.androidClient.uploadAsset(new File([raw],'native.png',{type:'image/png'}),owner);
                const image=new Image();image.src=c.localAssetUrl(photo.hash,owner);await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('Local photo did not decode'))});const canvas=document.createElement('canvas');canvas.width=canvas.height=1;canvas.getContext('2d').drawImage(image,0,0);if(canvas.getContext('2d').getImageData(0,0,1,1).data.length!==4)throw Error('Local photo pixels unavailable for color sampling');
                const save=(kind,data,extra={})=>request('/api/closet',{op:'save',kind,data,collectionId:state.collectionId,...extra});
                const item=await save('item',{name:'Original snapshot name',category:'top',color:'',colorStyle:{mode:'solid',values:[{name:'Native violet',hex:'#AABBCC'}]},asset:photo.hash,photos:[photo.hash],seasons:[],occasions:[],notes:'',archived:false,measurements:{chest:91}});
                const outfit=await save('outfit',{name:'Native outfit',itemIds:[item.id],asset:null,occasions:[],notes:'',archived:false});
                await save('calendar',{date:'2026-10-11',status:'worn',outfitId:outfit.id,notes:''});
                await save('subset',{name:'Native group',scope:'item',root:'all',parentId:null,memberIds:[item.id]});
                await save('personalSizes',{measurements:{height:170},shoeSize:{eu:40,cn:250}});
                let saved=await request('/api/closet'),record=saved.records.find(r=>r.id===item.id);await save('item',{...record.data,name:'Changed later'},{id:item.id,version:record.version});
                saved=await request('/api/closet');if(saved.records.length!==5||saved.records.find(r=>r.kind==='calendar').data.snapshot.items[0].data.name!=='Original snapshot name'||!saved.colorLibrary.some(v=>v.name==='Native violet'))throw Error('Offline records or snapshot mismatch');
                const manifest=c.manifestFromState(saved);if(JSON.stringify(manifest).includes('binding'))throw Error('Backup leaked pairing');
                await request('/api/profiles',{action:'select',id:originalOwner});owner=originalOwner;c.setProfileContext(owner);if((await request('/api/closet')).records.some(r=>r.id===item.id))throw Error('Account isolation failed');
                return {records:saved.records.length,photo:photo.hash};
            """.trimIndent())
        }
    }
    @Test fun offlineStorageOriginalBytesAndRestart(){
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            ready(scenario)
            val result=runJs(scenario,"""
                const n=window.Capacitor.Plugins.ClosetStorage;
                const root=JSON.parse((await n.read({key:'root'})).value);
                const before=await n.read({key:'instrument-large'});
                const value=JSON.stringify({note:'离线📷'.repeat(350000)});
                const saved=await n.write({key:'instrument-large',expected:before.revision,value});
                if((await n.read({key:'instrument-large'})).value!==value)throw Error('Large SQLite document mismatch');
                let stale=false;try{await n.write({key:'instrument-large',expected:before.revision,value:'{}'})}catch{stale=true}
                if(!stale)throw Error('Stale write accepted');
                const {handle}=await n.beginFile({owner:root.current});
                await n.appendFile({handle,data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jrWQAAAAASUVORK5CYII='});
                const {asset}=await n.finishFile({handle,owner:root.current,name:'原图.png'});
                const bytes=await (await fetch(window.Capacitor.convertFileSrc((await n.read({key:'root'})).filesRoot+'/media/'+root.current+'/'+asset.hash))).arrayBuffer();
                const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('');
                if(hash!==asset.hash||bytes.byteLength!==asset.size)throw Error('Original bytes changed');
                return {bytes:asset.size,revision:saved.revision};
            """.trimIndent())
            assertTrue(result.getJSONObject("value").getInt("bytes")>0)
            scenario.recreate();ready(scenario)
            runJs(scenario,"const d=await window.Capacitor.Plugins.ClosetStorage.read({key:'instrument-large'});if(JSON.parse(d.value).note.length!==1400000)throw Error('Restart lost SQLite data');return true;")
        }
    }
    @Test fun localNetworkAndImageVerification(){
        val args=InstrumentationRegistry.getArguments();val address=args.getString("closetAddress") ?: return
        val code=args.getString("closetCode")!!
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            ready(scenario);loadClient(scenario)
            runJs(scenario,"""
                const n=window.Capacitor.Plugins.ClosetStorage,root=JSON.parse((await n.read({key:'root'})).value);
                const address=${JSONObject.quote(address)};
                const paired=await n.http({url:address+'/api/sync/pair',method:'POST',body:JSON.stringify({protocolVersion:1,code:${JSONObject.quote(code)},deviceId:root.deviceId,name:'Android instrumentation'})});
                if(paired.status!==200)throw Error(paired.body);const pair=JSON.parse(paired.body);
                const response=await n.http({url:address+'/api/sync/state',method:'GET',token:pair.token});if(response.status!==200)throw Error(response.body);
                const state=JSON.parse(response.body),asset=state.replica.assets[0];if(!asset)throw Error('No image fixture');
                await n.transfer({url:address+'/api/sync/assets/'+asset.hash,token:pair.token,owner:root.current,asset,direction:'download'});
                await n.transfer({url:address+'/api/sync/assets/'+asset.hash,token:pair.token,owner:root.current,asset,direction:'upload'});
                let rejected=false;try{await n.transfer({url:address+'/api/sync/assets/'+asset.hash,token:pair.token,owner:root.current,asset:{...asset,size:asset.size+1},direction:'download'})}catch{rejected=true}
                if(!rejected)throw Error('Corrupt metadata accepted');
                const c=ClosetTest;await c.bootstrap();c.setProfileContext(root.current);
                await c.updateDocument(root.current,doc=>{doc.binding={...pair,url:address,base:{collections:[],assets:[],colorLibrary:[],tombstones:[]}}});
                await c.synchronize(root.current,()=>{});
                const doc=(await c.readDocument(root.current)).value,collection=doc.replica.collections.find(c=>c.records.some(r=>r.kind==='item'&&r.data.asset===asset.hash)),record=collection.records.find(r=>r.kind==='item'&&r.data.asset===asset.hash);
                const edited=await c.androidClient.request('/api/closet',{method:'POST',headers:{'X-Closet-Profile':root.current},body:JSON.stringify({op:'save',kind:'item',collectionId:collection.id,id:record.id,version:record.version,data:{...record.data,notes:'Native bidirectional sync '+Date.now()}})});if(!edited.ok)throw Error(await edited.text());
                await c.synchronize(root.current,()=>{});if((await c.syncStatus(root.current)).dirty)throw Error('Native sync did not acknowledge changes');
                const confirmed=JSON.parse((await n.http({url:address+'/api/sync/state',method:'GET',token:pair.token})).body);if(!confirmed.replica.collections.flatMap(c=>c.records).some(r=>r.id===record.id&&r.data.notes.startsWith('Native bidirectional sync')))throw Error('PC did not receive local edit');
                return {records:state.replica.collections[0].records.length,hash:asset.hash};
            """.trimIndent())
        }
    }
    @Test fun zipRoundTripThroughDocumentPicker(){
        val context=InstrumentationRegistry.getInstrumentation().targetContext
        val backup=File(context.cacheDir,"instrument-backup.zip")
        Intents.init()
        try {
            intending(hasAction(Intent.ACTION_CREATE_DOCUMENT)).respondWith(Instrumentation.ActivityResult(Activity.RESULT_OK,Intent().setData(Uri.fromFile(backup))))
            intending(hasAction(Intent.ACTION_OPEN_DOCUMENT)).respondWith(Instrumentation.ActivityResult(Activity.RESULT_OK,Intent().setData(Uri.fromFile(backup))))
            ActivityScenario.launch(MainActivity::class.java).use { scenario ->
                ready(scenario);loadClient(scenario)
                runJs(scenario,"""
                    const n=window.Capacitor.Plugins.ClosetStorage,root=JSON.parse((await n.read({key:'root'})).value);
                    const {handle}=await n.beginFile({owner:root.current});await n.appendFile({handle,data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jrWQAAAAASUVORK5CYII='});
                    const {asset}=await n.finishFile({handle,owner:root.current,name:'原图.png'});
                    const now=new Date().toISOString(),record={id:crypto.randomUUID(),kind:'item',version:1,createdAt:now,updatedAt:now,data:{name:'ZIP 原图单品',category:'top',color:'',asset:asset.hash,occasions:[],seasons:[],notes:'',archived:false}};
                    const manifest={format:'new-closet',schemaVersion:9,exportedAt:now,collection:{name:'验收衣橱'},records:[record],assets:[asset],colorLibrary:[]};
                    const saved=await n.exportArchive({owner:root.current,manifest,filename:'instrument-backup.zip'});if(!saved.saved)throw Error('Export cancelled');
                    const checked=await n.pickArchive();if(checked.manifest.assets[0].hash!==asset.hash)throw Error('Manifest changed');
                    const restoredOwner=crypto.randomUUID();await n.importStaged({handle:checked.handle,owner:restoredOwner});
                    const original=await (await fetch(window.Capacitor.convertFileSrc((await n.read({key:'root'})).filesRoot+'/media/'+restoredOwner+'/'+asset.hash))).arrayBuffer();
                    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',original))).map(b=>b.toString(16).padStart(2,'0')).join('');
                    if(hash!==asset.hash)throw Error('ZIP changed original bytes');
                    await ClosetTest.bootstrap();const collectionId=await ClosetTest.androidClient.importArchive(checked.handle,checked.manifest,root.current);const restored=(await ClosetTest.readDocument(root.current)).value.replica.collections.find(c=>c.id===collectionId);if(restored.records[0].id!==record.id||restored.records[0].data.asset!==asset.hash)throw Error('ZIP records did not restore to a new wardrobe');return true;
                """.trimIndent())
            }
            ZipFile(backup).use { zip -> assertNotNull(zip.getEntry("manifest.json"));assertEquals(3,zip.size()) }
        } finally { Intents.release() }
    }
    @Test fun saveItemInActualInterface(){
        val itemName="手机离线验收-"+System.currentTimeMillis()
        val context=InstrumentationRegistry.getInstrumentation().targetContext
        Intents.init()
        try {
        intending(hasAction(MediaStore.ACTION_IMAGE_CAPTURE)).respondWithFunction { intent ->
            val uri=intent.getParcelableExtra<Uri>(MediaStore.EXTRA_OUTPUT)!!
            context.contentResolver.openOutputStream(uri)!!.use { it.write(Base64.decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jrWQAAAAASUVORK5CYII=",Base64.DEFAULT)) }
            Instrumentation.ActivityResult(Activity.RESULT_OK,null)
        }
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            ready(scenario)
            eval(scenario,"document.querySelector('.android-add, header button.main-action').click();true")
            runJs(scenario,"for(let i=0;i<100;i++){if(document.querySelector('#item-name')&&document.querySelector('.photo-actions button'))return true;await new Promise(r=>setTimeout(r,100))}throw Error('Item form did not open: '+document.body.innerText);")
            // File inputs require a real user gesture; evaluateJavascript().click() is intentionally blocked.
            eval(scenario,"document.querySelector('.photo-actions button').scrollIntoView({block:'center'});true")
            val point=JSONObject(eval(scenario,"(()=>{const r=document.querySelector('.photo-actions button').getBoundingClientRect();return {x:(r.x+r.width/2)*devicePixelRatio,y:(r.y+r.height/2)*devicePixelRatio}})()"))
            val position=IntArray(2);scenario.onActivity { it.bridge.webView.getLocationOnScreen(position) }
            val time=SystemClock.uptimeMillis();val instrumentation=InstrumentationRegistry.getInstrumentation()
            for(action in listOf(MotionEvent.ACTION_DOWN,MotionEvent.ACTION_UP)){val event=MotionEvent.obtain(time,SystemClock.uptimeMillis(),action,position[0]+point.getDouble("x").toFloat(),position[1]+point.getDouble("y").toFloat(),0);instrumentation.sendPointerSync(event);event.recycle()}
            runJs(scenario,"for(let i=0;i<100;i++){if(document.querySelector('.photo-gallery-preview img'))return true;await new Promise(r=>setTimeout(r,100))}throw Error('Camera intent did not return the original photo');")
            Intents.intended(hasAction(MediaStore.ACTION_IMAGE_CAPTURE))
            eval(scenario,"const input=document.querySelector('#item-name');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,"+JSONObject.quote(itemName)+");input.dispatchEvent(new Event('input',{bubbles:true}));true")
            Thread.sleep(300)
            eval(scenario,"document.querySelector('.item-dialog form').requestSubmit();true")
            runJs(scenario,"""
                const n=window.Capacitor.Plugins.ClosetStorage;
                for(let i=0;i<100;i++){const root=JSON.parse((await n.read({key:'root'})).value);const doc=JSON.parse((await n.read({key:'profile:'+root.current})).value);const record=doc.replica.collections.flatMap(c=>c.records).find(r=>r.data.name===${JSONObject.quote(itemName)});if(record){if(!record.data.asset)throw Error('Camera photo missing from saved item');return true}await new Promise(r=>setTimeout(r,100))}throw Error('UI save did not persist');
            """.trimIndent())
            scenario.recreate();ready(scenario)
            runJs(scenario,"for(let i=0;i<100;i++){if(document.body.innerText.includes("+JSONObject.quote(itemName)+"))return true;await new Promise(r=>setTimeout(r,100))}throw Error('Reload did not show saved item');")
        }
        } finally { Intents.release() }
    }
    @Test fun androidNavigationAndDraftProtection(){
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            ready(scenario)
            runJs(scenario,"""
                if(document.documentElement.dataset.closetUi!=='android'||document.querySelectorAll('.android-bottom-nav button').length!==4)throw Error('Android appearance not loaded');
                const clickTab=async(name,title)=>{[...document.querySelectorAll('.android-bottom-nav button')].find(b=>b.textContent.includes(name)).click();for(let i=0;i<50;i++){if(document.querySelector('.android-page-heading h1')?.textContent===title)return;await new Promise(r=>setTimeout(r,50))}throw Error('Tab failed: '+name)};
                await clickTab('搭配','我的搭配');await clickTab('日历','穿搭日历');await clickTab('我的','我的');
                [...document.querySelectorAll('.android-my-links button')].find(b=>b.textContent.includes('我的尺码')).click();await new Promise(r=>setTimeout(r,200));
                const input=document.querySelector('.personal-sizes-panel input[type=number]');if(!input)throw Error('Sizes page unavailable');const nextHeight=input.value==='123'?'124':'123';Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,nextHeight);input.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(r=>setTimeout(r,200));
                [...document.querySelectorAll('.android-bottom-nav button')].find(b=>b.textContent.includes('衣橱')).click();await new Promise(r=>setTimeout(r,150));
                if(!document.querySelector('[role=alertdialog]')?.innerText.includes('切换页面前放弃草稿'))throw Error('Draft navigation was not guarded');
                [...document.querySelectorAll('[role=alertdialog] button')].find(b=>b.textContent==='保留草稿').click();await new Promise(r=>setTimeout(r,100));
                if(document.querySelector('.personal-sizes-panel input[type=number]').value!==nextHeight)throw Error('Keep draft lost edits');
                [...document.querySelectorAll('.android-bottom-nav button')].find(b=>b.textContent.includes('衣橱')).click();await new Promise(r=>setTimeout(r,100));
                [...document.querySelectorAll('[role=alertdialog] button')].find(b=>b.textContent==='放弃草稿并切换').click();await new Promise(r=>setTimeout(r,100));
                if(document.querySelector('.android-page-heading h1').textContent!=='我的衣橱')throw Error('Discard navigation failed');return true;
            """.trimIndent())
        }
    }
    @Test fun verifyPreviouslySavedItem(){
        if(InstrumentationRegistry.getArguments().getString("checkUpgrade")!="true")return
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            ready(scenario,null)
            InstrumentationRegistry.getArguments().getString("expectedLocale")?.let { locale -> assertEquals("Upgrade lost language preference",JSONObject.quote(locale),eval(scenario,"document.documentElement.lang")) }
            runJs(scenario,"const n=window.Capacitor.Plugins.ClosetStorage;const root=JSON.parse((await n.read({key:'root'})).value);const doc=JSON.parse((await n.read({key:'profile:'+root.current})).value);if(!doc.replica.collections.flatMap(c=>c.records).some(r=>r.data.name?.startsWith('手机离线验收-')))throw Error('Upgrade lost previously saved item');return true;")
        }
    }
    @Test fun phoneAiUpgradeKeepsCredentialsAndRecords() {
        if (InstrumentationRegistry.getArguments().getString("checkAiUpgrade") != "true") return
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            ready(scenario)
            runJs(scenario, """
                const n=window.Capacitor.Plugins.ClosetStorage,snapshot=JSON.parse((await n.read({key:'ai-upgrade-fixture'})).value),root=JSON.parse((await n.read({key:'root'})).value);if(root.current!==snapshot.owner)throw Error('Upgrade changed selected owner');
                const doc=JSON.parse((await n.read({key:'profile:'+root.current})).value),ids=doc.replica.collections.flatMap(c=>c.records.map(r=>r.id)).sort();if(JSON.stringify(ids)!==JSON.stringify(snapshot.recordIds))throw Error('Upgrade lost records');
                const stored=JSON.parse((await n.read({key:'ai:'+root.current})).value);if(stored.encryptedKey!==snapshot.encryptedKey)throw Error('Upgrade changed stored credential');
                const response=await n.modelRequest({owner:root.current,requestId:crypto.randomUUID(),body:JSON.stringify({messages:[{role:'user',content:'upgrade probe'}],tools:[]})});if(response.status!==200)throw Error('Keystore key did not survive upgrade');return {records:ids.length};
            """.trimIndent())
        }
    }
    @Test fun photoViewerGesturesAndCrop(){
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            ready(scenario);loadClient(scenario)
            val fixture=runJs(scenario,"""
                const c=ClosetTest;await c.bootstrap();
                const created=await c.androidClient.request('/api/profiles',{method:'POST',body:JSON.stringify({action:'create',name:'Photo viewer '+Date.now()})});
                if(!created.ok)throw Error(await created.text());const owner=(await created.json()).profile.id;c.setProfileContext(owner);
                const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=800;const ctx=canvas.getContext('2d');ctx.fillStyle='#ff0000';ctx.fillRect(0,0,600,800);ctx.fillStyle='#00ff00';ctx.fillRect(600,0,600,800);
                const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
                const asset=await c.androidClient.uploadAsset(new File([blob],'viewer-original.png',{type:'image/png'}),owner);
                const state=await (await c.androidClient.request('/api/closet')).json();
                const saved=await c.androidClient.request('/api/closet',{method:'POST',body:JSON.stringify({op:'save',kind:'item',collectionId:state.collectionId,data:{name:'大图裁剪验收',category:'top',color:'',occasions:[],seasons:[],notes:'',asset:asset.hash,photos:[asset.hash],archived:false}})});
                if(!saved.ok)throw Error(await saved.text());return {owner,hash:asset.hash};
            """.trimIndent()).getJSONObject("value")
            scenario.recreate();ready(scenario)
            eval(scenario,"document.querySelector('.item-card > button.photo').click();true")
            runJs(scenario,"for(let i=0;i<100;i++){if(document.querySelector('.photo-viewer-image')?.naturalWidth===1200)return true;await new Promise(r=>setTimeout(r,100))}throw Error('Photo click did not open original');")
            runJs(scenario,"const image=document.querySelector('.photo-viewer-image').getBoundingClientRect(),stage=document.querySelector('.photo-viewer-stage').getBoundingClientRect(),dialog=document.querySelector('.photo-viewer').getBoundingClientRect();if(image.width>stage.width+1||image.height>stage.height+1||Math.abs(dialog.x)>1||Math.abs(dialog.y)>1)throw Error('Photo is clipped or viewer is offset');return true;")
            val center=JSONObject(eval(scenario,"(()=>{const r=document.querySelector('.photo-viewer-stage').getBoundingClientRect();return {x:(r.x+r.width/2)*devicePixelRatio,y:(r.y+r.height/2)*devicePixelRatio}})()"))
            val origin=IntArray(2);scenario.onActivity { it.bridge.webView.getLocationOnScreen(origin) }
            val cx=origin[0]+center.getDouble("x").toFloat();val cy=origin[1]+center.getDouble("y").toFloat()
            val down=SystemClock.uptimeMillis();val instrumentation=InstrumentationRegistry.getInstrumentation()
            fun touch(action:Int,count:Int,distance:Float){
                val properties=Array(count){i->MotionEvent.PointerProperties().apply{id=i;toolType=MotionEvent.TOOL_TYPE_FINGER}}
                val coords=Array(count){i->MotionEvent.PointerCoords().apply{x=cx+(if(i==0)-distance else distance);y=cy;pressure=1f;size=1f}}
                val event=MotionEvent.obtain(down,SystemClock.uptimeMillis(),action,count,properties,coords,0,0,1f,1f,0,0,android.view.InputDevice.SOURCE_TOUCHSCREEN,0)
                instrumentation.sendPointerSync(event);event.recycle();Thread.sleep(40)
            }
            touch(MotionEvent.ACTION_DOWN,1,60f)
            touch(MotionEvent.ACTION_POINTER_DOWN or (1 shl MotionEvent.ACTION_POINTER_INDEX_SHIFT),2,60f)
            for(i in 1..10)touch(MotionEvent.ACTION_MOVE,2,60f+i*14f)
            touch(MotionEvent.ACTION_POINTER_UP or (1 shl MotionEvent.ACTION_POINTER_INDEX_SHIFT),2,200f)
            touch(MotionEvent.ACTION_UP,1,200f)
            runJs(scenario,"if(parseInt(document.querySelector('.photo-viewer output').textContent)<200)throw Error('Native two-finger gesture did not zoom');return true;")
            runJs(scenario,"""
                const stage=document.querySelector('.photo-viewer-stage'),rect=stage.getBoundingClientRect(),before=parseInt(document.querySelector('.photo-viewer output').textContent);
                stage.dispatchEvent(new WheelEvent('wheel',{deltaY:100,clientX:rect.x+rect.width/2,clientY:rect.y+rect.height/2,bubbles:true,cancelable:true}));
                await new Promise(r=>setTimeout(r,100));if(parseInt(document.querySelector('.photo-viewer output').textContent)>=before)throw Error('Wheel did not zoom out');
                [...document.querySelectorAll('.photo-viewer button')].find(b=>b.textContent==='裁剪').click();return true;
            """.trimIndent())
            runJs(scenario,"const select=document.querySelector('.photo-viewer select');select.value='1';select.dispatchEvent(new Event('change',{bubbles:true}));await new Promise(r=>setTimeout(r,100));const r=document.querySelector('.photo-crop-selection').getBoundingClientRect();if(Math.abs(r.width-r.height)>1)throw Error('Square crop is not square');[...document.querySelectorAll('.photo-viewer button')].find(b=>b.textContent==='保存为新照片').click();return true;")
            runJs(scenario,"""
                const n=window.Capacitor.Plugins.ClosetStorage;
                for(let i=0;i<100;i++){const doc=JSON.parse((await n.read({key:'profile:'+${JSONObject.quote(fixture.getString("owner"))}})).value);const record=doc.replica.collections[0].records[0];if(record.data.photos.length===2){if(!record.data.photos.includes(${JSONObject.quote(fixture.getString("hash"))}))throw Error('Crop removed original');if(record.data.asset===${JSONObject.quote(fixture.getString("hash"))})throw Error('Cover did not use cropped copy');return true;}await new Promise(r=>setTimeout(r,100))}throw Error('Crop did not commit: '+document.body.innerText);
            """.trimIndent())
            scenario.recreate();ready(scenario);loadClient(scenario)
            runJs(scenario,"""
                const c=ClosetTest,root=await c.bootstrap();c.setProfileContext(root.current);const state=await (await c.androidClient.request('/api/closet')).json(),record=state.records[0];
                if(record.data.photos.length!==2)throw Error('Restart lost cropped copy');
                const image=new Image();image.src=c.localAssetUrl(record.data.asset,root.current);await image.decode();if(image.naturalWidth!==640||image.naturalHeight!==640)throw Error('Wrong crop resolution');
                const canvas=document.createElement('canvas');canvas.width=640;canvas.height=640;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);if(ctx.getImageData(10,10,1,1).data[0]!==255||ctx.getImageData(630,10,1,1).data[1]!==255)throw Error('Crop pixel colors changed');
                const raw=await (await fetch(c.localAssetUrl(${JSONObject.quote(fixture.getString("hash"))},root.current))).arrayBuffer();
                const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',raw))).map(b=>b.toString(16).padStart(2,'0')).join('');if(hash!==${JSONObject.quote(fixture.getString("hash"))})throw Error('Original bytes changed');return true;
            """.trimIndent())
        }
    }
}
