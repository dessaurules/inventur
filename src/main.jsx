import './index.css'
import App from './App.jsx'
import { mountApp } from './mountApp.jsx'

const countingApp =
  typeof document !== 'undefined' &&
  document.documentElement.getAttribute('data-vibe-entry') === 'counting'

mountApp(App, { countingApp })
