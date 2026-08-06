export type FathomPort = {
    name: string
    query: string
    label: string
  }
  
  export const PORTS: FathomPort[] = [
    // 北極圏・極北
    { name: 'Svalbard', query: 'Svalbard, NO', label: '北極圏 / スヴァールバル' },
    { name: 'Nuuk', query: 'Nuuk, GL', label: 'グリーンランド / ヌーク' },
    { name: 'Utqiagvik', query: 'Utqiagvik, US', label: 'アラスカ最北 / ウトキアグヴィク' },
    { name: 'Tromso', query: 'Tromso, NO', label: '北極圏 / トロムソ' },
    { name: 'Iqaluit', query: 'Iqaluit, CA', label: 'カナダ極北 / イカルイト' },
    
    // 絶海の孤島
    { name: 'Tristan da Cunha', query: 'Edinburgh of the Seven Seas, SH', label: '世界一孤立した島 / トリスタン・ダ・クーニャ' },
    { name: 'Easter Island', query: 'Hanga Roa, CL', label: '絶海 / イースター島' },
    { name: 'Pitcairn', query: 'Adamstown, PN', label: '絶海 / ピトケアン諸島' },
    { name: 'Faroe Islands', query: 'Torshavn, FO', label: '北大西洋 / フェロー諸島' },
    { name: 'Azores', query: 'Ponta Delgada, PT', label: '大西洋の孤島 / アゾレス諸島' },
    
    // 世界の南端
    { name: 'Ushuaia', query: 'Ushuaia, AR', label: '世界最南端の都市 / ウシュアイア' },
    { name: 'Punta Arenas', query: 'Punta Arenas, CL', label: 'マゼラン海峡 / プンタ・アレーナス' },
    { name: 'Stanley', query: 'Stanley, FK', label: 'フォークランド諸島 / スタンリー' },
    { name: 'Grytviken', query: 'Grytviken, GS', label: 'サウスジョージア島 / グリトビケン' },
    
    // 荒涼たる大地
    { name: 'Petropavlovsk', query: 'Petropavlovsk-Kamchatsky, RU', label: 'カムチャツカ半島 / ペトロパブロフスク' },
    { name: 'Reykjavik', query: 'Reykjavik, IS', label: '火と氷の国 / レイキャビク' },
    { name: 'Churchill', query: 'Churchill, CA', label: 'ハドソン湾 / チャーチル' },
    { name: 'Vardo', query: 'Vardo, NO', label: 'バレンツ海 / ヴァルドー' },
    { name: 'Socotra', query: 'Hadibu, YE', label: 'インド洋の秘境 / ソコトラ島' },
    
    // 日本の最果て
    { name: 'Ogasawara', query: 'Ogasawara, JP', label: '太平洋 / 小笠原諸島' },
    { name: 'Nemuro', query: 'Nemuro, JP', label: 'オホーツク海 / 納沙布' },
    { name: 'Yonaguni', query: 'Yonaguni, JP', label: '国境の島 / 与那国' },
    
    // 荒ぶる海
    { name: 'Cape of Good Hope', query: 'Cape Town, ZA', label: '喜望峰 / ケープタウン' },
    { name: 'Brest', query: 'Brest, FR', label: '大西洋の嵐 / ブレスト' },
    { name: 'St. John\'s', query: 'St. John\'s, CA', label: '霧の海 / セントジョンズ' }
  ]