import './index.css'
import App from './App.jsx'
/* Nach App.css laden, damit Backend-Overrides die Desktop-Media-Queries schlagen */
import './backend.css'
import { mountApp } from './mountApp.jsx'

mountApp(App, { countingApp: false })
