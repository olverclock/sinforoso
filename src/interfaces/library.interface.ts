import { ContentType } from "@tobyg74/tiktok-api-dl/lib/types/common"

export interface MusicRecognition {
    producer: string,
    duration: string,
    release_date: string,
    album: string,
    title: string,
    artists: string
}

export interface XMedia {
    text: string,
    media: {
        type: "video" | "image",
        url: string
    }[]
}

export interface TiktokMedia {
    author_profile?: string,
    description?: string,
    type?: ContentType,
    duration: number | null,
    url: string | string[]
}

export interface FacebookMedia {
    url: string,
    duration: number,
    sd: string,
    hd: string,
    title: string,
    thumbnail: string,
}

export interface InstagramMedia {
    author_username: string,
    author_fullname: string,
    caption: string,
    likes: number,
    media: {
        type: "video" | "image",
        url?: string,
        buffer?: Buffer
    }[]
}

export interface YTInfo {
    id_video: string,
    title: string,
    description: string,
    duration: number,
    channel: string,
    is_live: boolean,
    duration_formatted: string,
    url: string,
    thumbnail?: string
}


export interface AnimeRelease {
    name: string,
    episode: string,
    url: string
}

export interface MangaRelease {
    name: string,
    chapter: string,
    url: string
}

export interface News {
    title: string,
    published: string,
    author: string,
    url: string
}

export interface WebSearch {
    title: string | null,
    url: string | null,
    description: string | null
}

export interface Wheather {
    location: {
        name: string,
        region: string,
        country: string,
        current_time: string
    },
    current: {
        last_updated: string,
        temp: string,
        feelslike: string,
        condition: string,
        wind: string,
        humidity: string,
        cloud: string
    },
    forecast: {
        day: string,
        max: string,
        min: string,
        avg: string,
        condition: string,
        max_wind: string,
        rain: string,
        chance_rain: string,
        snow: string,
        chance_snow: string,
        uv: number
    }[]
}

export interface MusicLyrics {
    title: string,
    artist: string,
    image: string,
    lyrics: string
}

export interface CurrencyConvert {
    value: number,
    currency: string,
    convertion: {
        currency: string,
        convertion_name: string,
        value_converted: string,
        value_converted_formatted: string,
        updated: string
    }[]
}

export interface AnimeRecognition {
    initial_time: string,
    final_time: string,
    episode: string,
    title: string,
    similarity: number,
    preview_url: string
}

export interface ImageSearch {
    url: string,
    thumbnail: string,
    title: string
}

export type StickerOptions = {
    author: string,
    pack: string,
    fps: number,
    type: StickerType,
    /** Figurinha animada: usa só os primeiros N segundos (figurinha com som: mesma duração do áudio). */
    maxSeconds?: number
}

export type AudioModificationType = "estourar" | "reverso" | "grave" | "agudo" | "x2" | "volume"

export type FileExtensions = 'mp3' | 'mp4' | 'webp' | 'png' | 'jpg' | 'gif' | 'zip' | 'wav' | 'm4a' | 'ogg'

export type StickerType = "resize" | "contain" | "circle"