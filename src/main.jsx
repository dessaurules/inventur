import './index.css'
/* Desktop-Kopfzeile (side-menu horizontal) – auch für index.html ab 768px via body.backend-desktop */
import './backend.css'
import App from './App.jsx'
import { mountApp } from './mountApp.jsx'

const countingApp =
  typeof document !== 'undefined' &&
  document.documentElement.getAttribute('data-vibe-entry') === 'counting'

mountApp(App, { countingApp })
