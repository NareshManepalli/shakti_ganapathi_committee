import React from 'react'
import { LanguageProvider } from './contexts/LanguageContext'
import { ContentProvider } from './contexts/ContentContext'
import Header from './components/Header'
import Home from './components/Home'
import About from './components/About'
import Committee from './components/Committee'
import Schedule from './components/Schedule'
import Gallery from './components/Gallery'
import MandapamLocation from './components/MandapamLocation'
import Footer from './components/Footer'
import './App.css'

function App() {
  return (
    <LanguageProvider>
      <ContentProvider>
        <div className="App">
          <Header />
          <Home />
          <About />
          <Committee />
          <Schedule />
          <Gallery />
          {/* The fund ledger is not public. Phase 5 replaces it with a
              Committee Fund button that gates access to /transactions. */}
          <MandapamLocation />
          <Footer />
        </div>
      </ContentProvider>
    </LanguageProvider>
  )
}

export default App

