<script setup lang="ts">
import {computed,nextTick,onBeforeUnmount,onMounted,reactive,ref,watch} from 'vue'
import {Search,Heart,Settings,Shuffle,Globe2,Play,Pause,SkipBack,SkipForward,Volume2,VolumeX,Timer,RotateCcw,X,ChevronDown,MapPin,Radio,Telescope,History,ExternalLink,WifiOff,Menu,Trash2} from 'lucide-vue-next'
import GlobeView from './components/GlobeView.vue'
import {PLACES,TAGS,findPlace} from './data'
import {radioApi} from './services/radio'
import {AudioEngine} from './services/audio'
import {clearAll,clearStore,listSaved,removeStation,saveStation} from './services/storage'
import type {Place,PlayerStatus,Station} from './types'

const defaultSettings={language:'zh',quality:'auto',autoRotate:true,reduceMotion:matchMedia('(prefers-reduced-motion: reduce)').matches,autoPlayRandom:false,dataSaver:false}
const settings=reactive({...defaultSettings,...JSON.parse(localStorage.getItem('wr-settings')||'{}')})
watch(settings,v=>localStorage.setItem('wr-settings',JSON.stringify(v)),{deep:true})
const place=ref<Place>(PLACES.find(p=>p.code==='JP')!),stations=ref<Station[]>([]),loading=ref(false),loadError=ref(''),offset=ref(0),hasMore=ref(true)
const tag=ref(''),language=ref(''),sort=ref('recommended'),query=ref(''),searching=ref(false),searchResults=ref<Station[]>([]),searchOpen=ref(false)
const current=ref<Station|null>(null),playerStatus=ref<PlayerStatus>('idle'),playerError=ref(''),volume=ref(.72),muted=ref(false),queue=ref<Station[]>([])
const favorites=ref<Station[]>([]),history=ref<Station[]>([]),activeModal=ref<'favorites'|'history'|'settings'|'about'|null>(null),mobilePanel=ref(true),online=ref(navigator.onLine),toast=ref('')
const sleepMinutes=ref(0),sleepLeft=ref(0);let sleepInterval:number|null=null;let searchTimer:number|null=null
const globe=ref<InstanceType<typeof GlobeView>>(),engine=new AudioEngine()
engine.onState=(s,msg)=>{playerStatus.value=s;playerError.value=msg||''}
const favoriteIds=computed(()=>new Set(favorites.value.map(x=>x.id)))
const filteredStations=computed(()=>[...stations.value].sort((a,b)=>sort.value==='name'?a.name.localeCompare(b.name):sort.value==='bitrate'?(b.bitrate||0)-(a.bitrate||0):sort.value==='popular'?(b.clickCount||0)-(a.clickCount||0):(b.votes||0)-(a.votes||0)))
const localTime=computed(()=>new Intl.DateTimeFormat(settings.language==='zh'?'zh-CN':'en-US',{timeZone:place.value.timezone,hour:'2-digit',minute:'2-digit',weekday:'short'}).format(new Date()))
const statusText=computed(()=>({idle:'选择一间电台开始收听',loading:'正在连接电台…',playing:'正在播放',paused:'已暂停',error:playerError.value||'播放失败'}[playerStatus.value]))
function flash(s:string){toast.value=s;setTimeout(()=>toast.value='',2200)}
async function refreshSaved(){favorites.value=await listSaved('favorites');history.value=await listSaved('history')}
async function load(reset=true){loading.value=true;loadError.value='';if(reset){offset.value=0;stations.value=[];hasMore.value=true}try{const rows=await radioApi.byCountry(place.value.code,offset.value,tag.value,language.value);stations.value=reset?rows:[...stations.value,...rows.filter(r=>!stations.value.some(s=>s.id===r.id))];queue.value=stations.value;hasMore.value=rows.length===30;offset.value+=rows.length}catch(e){if((e as Error).name!=='AbortError')loadError.value=online.value?'电台目录暂时不可用，请稍后重试':'当前离线，仍可播放收藏或历史中的缓存地址'}finally{loading.value=false}}
async function selectPlace(p:Place){place.value=p;mobilePanel.value=true;tag.value='';language.value='';await load();if(settings.autoPlayRandom&&stations.value[0])play(stations.value[0])}
async function selectCountry(code:string){const p=PLACES.find(x=>x.code===code);if(p)await selectPlace(p);else flash('该国家暂无本地化索引，可通过搜索查找电台')}
async function randomTrip(){let next=place.value;while(next.code===place.value.code)next=PLACES[Math.floor(Math.random()*PLACES.length)];await selectPlace(next)}
async function play(s:Station){if(current.value?.id===s.id&&playerStatus.value==='playing'){engine.pause();return}current.value=s;queue.value=filteredStations.value;playerStatus.value='loading';saveStation('history',s).then(refreshSaved).catch(()=>{});radioApi.click(s.id).catch(()=>{});engine.setVolume(volume.value);engine.setMuted(muted.value);await engine.play(s)}
async function togglePlay(){if(!current.value)return;if(playerStatus.value==='playing')engine.pause();else if(playerStatus.value==='paused')await engine.resume();else await engine.play(current.value)}
function adjacent(delta:number){if(!queue.value.length)return;const i=Math.max(0,queue.value.findIndex(s=>s.id===current.value?.id));play(queue.value[(i+delta+queue.value.length)%queue.value.length])}
function toggleFavorite(s:Station){
 const wasFavorite=favoriteIds.value.has(s.id)
 favorites.value=wasFavorite?favorites.value.filter(item=>item.id!==s.id):[s,...favorites.value.filter(item=>item.id!==s.id)]
 flash(wasFavorite?'已取消收藏':'已加入收藏')
 const persist=wasFavorite?removeStation('favorites',s.id):saveStation('favorites',s)
 persist.catch(()=>{
  favorites.value=wasFavorite?[s,...favorites.value.filter(item=>item.id!==s.id)]:favorites.value.filter(item=>item.id!==s.id)
  flash('收藏保存失败，请检查浏览器存储权限')
 })
}
function doSearch(){if(searchTimer)clearTimeout(searchTimer);const q=query.value.trim();if(!q){searchResults.value=[];searchOpen.value=false;return}searchOpen.value=true;searchTimer=window.setTimeout(async()=>{const p=findPlace(q);if(p){searchResults.value=[];searching.value=false;return}searching.value=true;try{searchResults.value=await radioApi.search(q)}catch(e){if((e as Error).name!=='AbortError')searchResults.value=[]}finally{searching.value=false}},350)}
async function choosePlaceSearch(){const p=findPlace(query.value);if(p){searchOpen.value=false;query.value='';await selectPlace(p)}}
function selectSearchStation(s:Station){searchOpen.value=false;query.value='';stations.value=searchResults.value;play(s);mobilePanel.value=true}
function setSleep(minutes:number){sleepMinutes.value=minutes;sleepLeft.value=minutes*60;if(sleepInterval)clearInterval(sleepInterval);if(!minutes)return;sleepInterval=window.setInterval(()=>{sleepLeft.value--;if(sleepLeft.value<=0){engine.pause();if(sleepInterval)clearInterval(sleepInterval);sleepMinutes.value=0;flash('睡眠定时器已停止播放')}},1000)}
function sleepLabel(){return sleepLeft.value?`${Math.floor(sleepLeft.value/60)}:${String(sleepLeft.value%60).padStart(2,'0')}`:'睡眠定时'}
async function wipe(){await clearAll();Object.assign(settings,defaultSettings);await refreshSaved();flash('本地数据已清除')}
watch([tag,language],()=>load());watch(volume,v=>engine.setVolume(v));watch(muted,v=>engine.setMuted(v))
onMounted(async()=>{await refreshSaved();await load();addEventListener('online',()=>online.value=true);addEventListener('offline',()=>online.value=false)})
onBeforeUnmount(()=>{engine.destroy();if(sleepInterval)clearInterval(sleepInterval)})
</script>

<template>
<main class="app-shell">
 <header class="topbar">
  <button class="brand" aria-label="World Radio 首页" @click="globe?.reset()"><span class="brand-mark"><Radio :size="20"/></span><span>WORLD RADIO</span><small>声音地球</small></button>
  <div class="search-wrap">
   <Search :size="18"/><input v-model="query" @input="doSearch" @keydown.enter="choosePlaceSearch" placeholder="搜索国家、城市、电台或音乐类型" aria-label="搜索"/><button v-if="query" class="icon-button" @click="query='';doSearch()"><X :size="16"/></button>
   <div v-if="searchOpen" class="search-results glass">
    <div v-if="findPlace(query)" class="result-section"><label>地区</label><button class="place-result" @click="choosePlaceSearch"><span>{{findPlace(query)?.flag}}</span><span><b>{{findPlace(query)?.nameZh}}</b><small>{{findPlace(query)?.name}}</small></span><MapPin :size="17"/></button></div>
    <div class="result-section"><label>电台</label><div v-if="searching" class="skeleton-line" v-for="i in 3" :key="i"></div><button v-else v-for="s in searchResults" :key="s.id" class="station-result" @click="selectSearchStation(s)"><span class="mini-logo"><img v-if="s.logo" :src="s.logo" @error="($event.target as HTMLImageElement).style.display='none'"/><Radio v-else :size="16"/></span><span><b>{{s.name}}</b><small>{{s.countryName}} · {{s.tags.slice(0,2).join(' / ')||'综合'}}</small></span><Play :size="16"/></button><p v-if="!searching&&!searchResults.length&&!findPlace(query)" class="empty">没有找到结果，试试 jazz、BBC 或 Japan</p></div>
   </div>
  </div>
  <nav><button class="icon-button" @click="activeModal='favorites'" title="收藏"><Heart :size="19"/><i v-if="favorites.length">{{favorites.length}}</i></button><button class="icon-button" @click="activeModal='history'" title="最近收听"><History :size="19"/></button><button class="icon-button" @click="activeModal='settings'" title="设置"><Settings :size="19"/></button></nav>
 </header>
 <div v-if="!online" class="offline"><WifiOff :size="14"/> 当前离线，地球与本地数据仍可使用</div>
 <section class="workspace">
  <div class="globe-stage">
   <div class="aurora a1"></div><div class="aurora a2"></div>
   <GlobeView ref="globe" :place :stations :auto-rotate="settings.autoRotate" :low-quality="settings.quality==='low'||settings.dataSaver" :reduce-motion="settings.reduceMotion" @select-country="selectCountry" @select-station="play" @interacted="settings.autoRotate=false"/>
   <div class="location-chip glass"><MapPin :size="16"/><span>{{place.flag}} {{place.nameZh}}</span><i>{{localTime}}</i></div>
   <div class="globe-actions"><button class="primary" @click="randomTrip"><Shuffle :size="17"/>随机旅行</button><button class="glass-button" @click="globe?.reset()"><RotateCcw :size="17"/>全球视角</button></div>
   <p class="globe-hint"><span></span>拖动探索 · 滚轮缩放 · 点击国家</p>
  </div>
  <aside :class="['region-panel',{'mobile-open':mobilePanel}]">
   <button class="mobile-handle" @click="mobilePanel=!mobilePanel" aria-label="展开或收起面板"><span></span></button>
   <div class="region-head"><div><p class="eyebrow">NOW EXPLORING</p><h1>{{place.nameZh}}</h1><p>{{place.name}} · {{localTime}}</p></div><span class="flag">{{place.flag}}</span></div>
   <div class="stats"><div><b>{{stations.length}}{{hasMore?'+':''}}</b><span>可用电台</span></div><div><b>{{stations.filter(s=>s.hasReliableGeo).length}}</b><span>精确点位</span></div><div><b>{{new Set(stations.flatMap(s=>s.languages)).size}}</b><span>语言</span></div></div>
   <div class="filter-row"><div class="chips"><button :class="{active:!tag}" @click="tag=''">全部</button><button v-for="t in TAGS.slice(0,6)" :key="t[0]" :class="{active:tag===t[0]}" @click="tag=t[0]">{{t[1]}}</button></div><label class="select"><select v-model="sort"><option value="recommended">推荐排序</option><option value="popular">热门</option><option value="name">名称</option><option value="bitrate">码率</option></select><ChevronDown :size="14"/></label></div>
   <div class="station-list">
    <div v-if="loading&&!stations.length" v-for="i in 5" :key="i" class="station-card skeleton"><span></span><div></div></div>
    <div v-else-if="loadError" class="empty-state"><WifiOff/><h3>暂时无法连接电台目录</h3><p>{{loadError}}</p><button class="primary" @click="load()">重新加载</button></div>
    <article v-else v-for="s in filteredStations" :key="s.id" :class="['station-card',{playing:current?.id===s.id}]">
     <button class="logo" @click="play(s)" :aria-label="`播放 ${s.name}`"><img v-if="s.logo" :src="s.logo" loading="lazy" @error="($event.target as HTMLImageElement).style.display='none'"/><Radio v-else :size="22"/><span><Pause v-if="current?.id===s.id&&playerStatus==='playing'"/><Play v-else/></span></button>
     <div class="station-info"><h3>{{s.name}}</h3><p><span v-if="s.region">{{s.region}} · </span>{{s.languages[0]||'未知语言'}}<span v-if="s.bitrate"> · {{s.bitrate}} kbps</span></p><div><em v-for="x in s.tags.slice(0,2)" :key="x">{{x}}</em><em v-if="!s.hasReliableGeo" class="muted-tag">位置未提供</em></div></div>
     <button :class="['heart',{favorite:favoriteIds.has(s.id)}]" @click.stop="toggleFavorite(s)" :aria-label="favoriteIds.has(s.id)?'取消收藏':'收藏'"><Heart :fill="favoriteIds.has(s.id)?'currentColor':'none'"/></button>
    </article>
    <button v-if="hasMore&&!loading&&!loadError" class="load-more" @click="load(false)">加载更多电台</button>
   </div>
  </aside>
 </section>
 <footer class="player">
  <div class="now"><div class="cover"><img v-if="current?.logo" :src="current.logo"/><Radio v-else/></div><div><b>{{current?.name||'世界正在发声'}}</b><span :class="playerStatus">{{statusText}}</span></div><button v-if="current" :class="['heart',{favorite:favoriteIds.has(current.id)}]" @click.stop="toggleFavorite(current)"><Heart :fill="favoriteIds.has(current.id)?'currentColor':'none'"/></button></div>
  <div class="transport"><button @click="adjacent(-1)" :disabled="!current"><SkipBack/></button><button class="play-main" @click="togglePlay" :disabled="!current"><Pause v-if="playerStatus==='playing'"/><span v-else-if="playerStatus==='loading'" class="spinner"></span><Play v-else fill="currentColor"/></button><button @click="adjacent(1)" :disabled="!current"><SkipForward/></button></div>
  <div class="player-tools"><button @click="muted=!muted"><VolumeX v-if="muted||volume===0"/><Volume2 v-else/></button><input v-model.number="volume" type="range" min="0" max="1" step="0.01" aria-label="音量"/><div class="timer-wrap"><button><Timer/> <span>{{sleepLabel()}}</span></button><div class="timer-menu"><button v-for="m in [15,30,60]" :key="m" @click="setSleep(m)">{{m}} 分钟</button><button @click="setSleep(0)">取消定时</button></div></div></div>
 </footer>
</main>

<Teleport to="body"><div v-if="activeModal" class="modal-backdrop" @click.self="activeModal=null"><section class="modal glass"><header><div><p class="eyebrow">YOUR WORLD</p><h2>{{activeModal==='favorites'?'我的收藏':activeModal==='history'?'最近收听':activeModal==='settings'?'偏好设置':'关于'}}</h2></div><button class="icon-button" @click="activeModal=null"><X/></button></header>
 <div v-if="activeModal==='favorites'||activeModal==='history'" class="saved-list"><div v-if="!(activeModal==='favorites'?favorites:history).length" class="empty-state"><Heart/><h3>这里还没有电台</h3><p>探索世界并收藏喜欢的声音。</p></div><article v-for="s in activeModal==='favorites'?favorites:history" :key="s.id" class="saved-item"><button class="logo" @click="play(s);activeModal=null"><img v-if="s.logo" :src="s.logo"/><Radio v-else/><span><Play/></span></button><div><b>{{s.name}}</b><span>{{s.countryName||'未知地区'}} · {{s.tags[0]||'综合'}}</span></div><button @click="activeModal==='favorites'?toggleFavorite(s):removeStation('history',s.id).then(refreshSaved)"><Trash2/></button></article><button v-if="activeModal==='history'&&history.length" class="danger" @click="clearStore('history').then(refreshSaved)">清空最近收听</button></div>
 <div v-if="activeModal==='settings'" class="settings-list"><label><span><b>自动旋转</b><small>无操作时让地球缓慢转动</small></span><input v-model="settings.autoRotate" type="checkbox"/></label><label><span><b>减少动画</b><small>关闭镜头飞行动效</small></span><input v-model="settings.reduceMotion" type="checkbox"/></label><label><span><b>随机旅行后自动播放</b><small>到达新地区时播放首个推荐</small></span><input v-model="settings.autoPlayRandom" type="checkbox"/></label><label><span><b>移动网络省流</b><small>降低地球画质与数据使用</small></span><input v-model="settings.dataSaver" type="checkbox"/></label><label><span><b>地球画质</b><small>低性能设备建议选择低</small></span><select v-model="settings.quality"><option value="auto">自动</option><option value="high">高</option><option value="low">低</option></select></label><button class="source" @click="activeModal='about'">数据来源与版权说明 <ExternalLink/></button><button class="danger" @click="wipe">清除收藏、历史与设置</button></div>
 <div v-if="activeModal==='about'" class="about"><Globe2/><p>电台目录来自开放项目 <a href="https://www.radio-browser.info/" target="_blank">Radio Browser</a>。地理边界来自 Natural Earth，经 world-atlas 转换。地球纹理由 three-globe 示例资源提供。</p><p>本站仅播放电台公开直播地址，不录制、下载、转码或重新分发音频。第三方电台可能因格式、网络、安全策略或地区限制无法播放。</p><p>收藏、历史和设置只保存在当前浏览器，不收集精确位置或个人身份信息。</p></div>
</section></div></Teleport><Transition name="toast"><div v-if="toast" class="toast">{{toast}}</div></Transition>
</template>
