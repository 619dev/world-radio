export type PlayerStatus = 'idle'|'loading'|'playing'|'paused'|'error'
export interface Station {id:string;name:string;streamUrl:string;homepage?:string;logo?:string;countryCode?:string;countryName?:string;region?:string;languages:string[];tags:string[];codec?:string;bitrate?:number;hls?:boolean;latitude?:number;longitude?:number;hasReliableGeo:boolean;votes?:number;clickCount?:number;isAvailable?:boolean}
export interface Place {code:string;name:string;nameZh:string;lat:number;lng:number;timezone:string;aliases:string[];flag:string}
