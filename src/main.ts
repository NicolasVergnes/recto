import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'
import { initPwa } from '$lib/state/pwa.svelte'

const target = document.getElementById('app')
if (!target) throw new Error('Missing #app element')

initPwa()

export default mount(App, { target })
