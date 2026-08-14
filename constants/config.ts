import {Platform} from 'react-native'

const HOST = Platform.select({
    ios:"10.13.54.81",
    android:"10.13.54.81",
    default:"localhost"
})

export const API_BASE_URL = `http://${HOST}:3000`;
export const WS_URL = `ws://${HOST}:3000`;