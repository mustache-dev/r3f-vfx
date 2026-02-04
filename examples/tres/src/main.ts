import { createApp } from 'vue'
import Tres from '@tresjs/core'
import App from './App.vue'
import './index.css'

const app = createApp(App)
app.use(Tres)
app.mount('#app')
