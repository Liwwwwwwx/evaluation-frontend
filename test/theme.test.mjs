import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source = fs.readFileSync(new URL('../src/lib/theme.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function harness({ stored = null, systemDark = false, blocked = false } = {}) {
  const events = new Map(), mediaListeners = new Set(); let saved = stored;
  const storage = { getItem: () => { if(blocked) throw Error('storage blocked'); return saved; }, setItem: (_,v) => { if(blocked) throw Error('storage blocked'); saved=v; } };
  const media = { matches: systemDark, addEventListener: (_,fn) => mediaListeners.add(fn), removeEventListener: (_,fn) => mediaListeners.delete(fn) };
  const window = { localStorage: storage, matchMedia: () => media, addEventListener: (name,fn) => { if(!events.has(name))events.set(name,new Set());events.get(name).add(fn); }, removeEventListener: (name,fn) => events.get(name)?.delete(fn), dispatchEvent: e => { for(const fn of events.get(e.type)||[])fn(e); } };
  const document = { documentElement: { dataset: {} } }; const context = vm.createContext({ exports: {}, window, document, localStorage: storage, Event });
  vm.runInContext(compiled, context); const api = context.exports;
  return { api, document, media, events, storage,
    init: () => vm.runInContext(api.THEME_INIT_SCRIPT, context),
    changeSystem: dark => { media.matches=dark;for(const fn of mediaListeners)fn(); },
    storageEvent: (value,key=api.THEME_STORAGE_KEY,storageArea=storage) => { saved=value;window.dispatchEvent({type:'storage',key,newValue:value,storageArea}); },
    saved: () => saved,
    listeners: () => mediaListeners.size+[...events.values()].reduce((sum,set)=>sum+set.size,0),
  };
}
test('首次跟随系统，显式选择在首屏覆盖系统；非法本地值回退且不执行', () => {
 for(const [stored,systemDark,expected,pref] of [[null,false,'light','system'],[null,true,'dark','system'],['light',true,'light','light'],['dark',false,'dark','dark'],['system',true,'dark','system'],['<script>bad()</script>',false,'light','system']]){
  const h=harness({stored,systemDark});h.init();assert.equal(h.document.documentElement.dataset.theme,expected);assert.equal(h.api.getThemePreference(),pref);
 }
});
test('跟随系统实时变化，手动主题不被系统覆盖，重新选择system恢复跟随', () => {
 const h=harness();h.init();let notifications=0;const stop=h.api.subscribeTheme(()=>notifications++);
 h.changeSystem(true);assert.equal(h.document.documentElement.dataset.theme,'dark');assert.equal(h.api.getThemePreference(),'system');
 h.api.setThemePreference('light');h.changeSystem(false);h.changeSystem(true);assert.equal(h.document.documentElement.dataset.theme,'light');assert.equal(h.saved(),'light');
 h.api.setThemePreference('system');assert.equal(h.document.documentElement.dataset.theme,'dark');assert.equal(notifications,2);stop();assert.equal(h.listeners(),0);
});
test('跨标签同步选择与清除，忽略无关键和sessionStorage事件', () => {
 const h=harness({systemDark:true});h.init();let updates=0;const stop=h.api.subscribeTheme(()=>updates++);
 h.storageEvent('light');assert.equal(h.api.getThemePreference(),'light');assert.equal(h.document.documentElement.dataset.theme,'light');
 h.storageEvent('dark','unrelated');assert.equal(h.api.getThemePreference(),'light');h.storageEvent('dark',h.api.THEME_STORAGE_KEY,{});assert.equal(h.api.getThemePreference(),'light');
 h.storageEvent(null,null);assert.equal(h.api.getThemePreference(),'system');assert.equal(h.document.documentElement.dataset.theme,'dark');assert.equal(updates,2);stop();
});
test('存储不可用仍可切换当前页，订阅卸载后没有遗留监听', () => {
 const h=harness({blocked:true,systemDark:true});h.init();const stop=h.api.subscribeTheme(()=>{});assert.equal(h.document.documentElement.dataset.theme,'dark');
 h.api.setThemePreference('light');assert.equal(h.api.getThemePreference(),'light');assert.equal(h.document.documentElement.dataset.theme,'light');stop();assert.equal(h.listeners(),0);
});
function luminance(hex) { if(hex.length===4)hex='#'+hex.slice(1).split('').map(c=>c+c).join(''); const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb.reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0); }
function contrast(a,b) { const values=[luminance(a),luminance(b)].sort((a,b)=>b-a);return (values[0]+.05)/(values[1]+.05); }
test('两种主题的正文/辅助/输入占位文字及主按钮使用可读对比度',()=>{
 const css=fs.readFileSync(new URL('../src/app/globals.css',import.meta.url),'utf8');
 for(const selector of [':root',':root[data-theme="dark"]']){
  const start=css.indexOf(selector+' {');const body=css.slice(start,css.indexOf('}',start));const vars=Object.fromEntries([...body.matchAll(/(--[\w-]+):\s*(#[0-9a-f]{3,6});/gi)].map(m=>[m[1],m[2]]));
  for(const fg of ['--color-fg','--color-fg-muted','--color-fg-placeholder'])for(const bg of ['--color-bg','--color-bg-elevated','--color-bg-surface','--color-bg-subtle'])assert.ok(contrast(vars[fg],vars[bg])>=4.5,`${selector} ${fg} on ${bg}: ${contrast(vars[fg],vars[bg]).toFixed(2)}`);
  assert.ok(contrast(vars['--color-action'],vars['--color-action-fg'])>=4.5);
 }
});
