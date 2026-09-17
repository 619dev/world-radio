import Hls from 'hls.js'
import type { Station,PlayerStatus } from '../types'
import {isProxiedStation,playbackUrl} from './streamProxy'
export class AudioEngine{
 audio=new Audio();hls:Hls|null=null;timer:number|null=null;generation=0;volume=1;muted=false;activeMixedContent=false
 onState:(s:PlayerStatus,msg?:string)=>void=()=>{}
 constructor(){this.setupAudio()}
 private setupAudio(){
  const audio=this.audio,currentGeneration=this.generation
  audio.preload='none';audio.volume=this.volume;audio.muted=this.muted
  audio.addEventListener('playing',()=>{if(currentGeneration===this.generation)this.onState('playing')})
  audio.addEventListener('pause',()=>{if(currentGeneration===this.generation&&audio.src)this.onState('paused')})
  audio.addEventListener('error',()=>{if(currentGeneration===this.generation)this.onState('error',this.errorMessage())})
 }
 async play(station:Station){
  this.stop();const generation=this.generation;this.onState('loading')
  const isMixedContent=location.protocol==='https:'&&station.streamUrl.startsWith('http:')
  this.activeMixedContent=isMixedContent&&!isProxiedStation(station)
  let url:string
  try{
   url=playbackUrl(station)
   if((station.codec==='HLS'||/\.m3u8($|\?)/i.test(url))&&Hls.isSupported()){this.hls=new Hls({enableWorker:true});this.hls.loadSource(url);this.hls.attachMedia(this.audio)}else this.audio.src=url
   await Promise.race([this.audio.play(),new Promise((_,reject)=>{this.timer=window.setTimeout(()=>reject(new Error('连接超时')),15000)})])
   if(generation!==this.generation)return
   if(this.timer)clearTimeout(this.timer)
  }catch(e){if(generation===this.generation)this.onState('error',(e as Error).message.includes('NotAllowed')?'浏览器阻止了自动播放，请再次点击播放':isMixedContent&&!isProxiedStation(station)?(e as Error).message:'当前电台暂不可用或格式不受支持')}
 }
 pause(){this.audio.pause()} async resume(){this.onState('loading');await this.audio.play()}
 stop(){
  this.generation++;if(this.timer)clearTimeout(this.timer);this.timer=null
  this.hls?.stopLoad();this.hls?.detachMedia();this.hls?.destroy();this.hls=null
  const old=this.audio;old.pause();old.src='';old.removeAttribute('src');old.load()
  this.audio=new Audio();this.setupAudio()
 }
 setVolume(v:number){this.volume=v;this.audio.volume=v} setMuted(v:boolean){this.muted=v;this.audio.muted=v}
 errorMessage(){if(!navigator.onLine)return '网络已断开，请恢复连接后重试';if(this.activeMixedContent)return '该电台只提供 HTTP 流，且 HTTPS 升级失败，请尝试下一台';return '当前电台暂不可用，可能存在格式或地区限制'}
 destroy(){this.stop()}
}
