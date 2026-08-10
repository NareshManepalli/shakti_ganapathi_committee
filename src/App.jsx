import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { LanguageProvider } from './contexts/LanguageContext'
import { ContentProvider } from './contexts/ContentContext'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Header from './components/Header'
import Home from './components/Home'
import About from './components/About'
import Committee from './components/Committee'
import Schedule from './components/Schedule'
import Gallery from './components/Gallery'
import MandapamLocation from './components/MandapamLocation'
import FundsGate from './components/FundsGate'
import Footer from './components/Footer'
import LoginPage from './pages/LoginPage'
import OtpPage from './pages/OtpPage'
import AdminLayout from './admin/AdminLayout'
import Profile from './admin/pages/Profile'
import WorkInProgress from './admin/pages/WorkInProgress'
import AdminGallery from './admin/pages/Gallery'
import AdminAbout from './admin/pages/About'
import AdminMandapam from './admin/pages/Mandapam'
import AdminSchedule from './admin/pages/Schedule'
import AdminMembers from './admin/pages/Members'
import AdminSettings from './admin/pages/Settings'
import './App.css'

// The public scroll page. Everything a visitor sees lives here.
const PublicSite = () => (
  <div className="App">
    <Header />
    <Home />
    <About />
    <Committee />
    <Schedule />
    <Gallery />
    {/* Shares one background with the section above it — see .page-tail */}
    <div className="page-tail">
      <MandapamLocation />
      {/* Committee-only doorway — the last thing on the page, deliberately
          not in the nav. */}
      <FundsGate />
    </div>
    <Footer />
  </div>
)

// Bounces to the login page unless a session is present. The server checks the
// token on every request too — this only decides what to render.
const RequireAuth = ({ children }) => {
  const { isAuthed } = useAuth()
  return isAuthed ? children : <Navigate to="/funds" replace />
}

function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <ContentProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<PublicSite />} />
              <Route path="/funds" element={<LoginPage />} />
              <Route path="/funds/verify" element={<OtpPage />} />
              {/* Everything under /admin shares the portal shell. The menu is
                  filtered by adm_in, but the server checks the signed token on
                  every write, so hiding a link is convenience, not security. */}
              <Route path="/admin" element={<RequireAuth><AdminLayout /></RequireAuth>}>
                {/* No landing screen of its own — sign-in drops everyone
                    straight into Monthly Funds, the one screen every member
                    can reach whatever their adm_in says. */}
                <Route index element={<Navigate to="/admin/monthly-funds" replace />} />
                <Route path="profile" element={<Profile />} />
                <Route path="about" element={<AdminAbout />} />
                <Route path="members" element={<AdminMembers />} />
                <Route path="gallery" element={<AdminGallery />} />
                <Route path="schedule" element={<AdminSchedule />} />
                <Route path="mandapam" element={<AdminMandapam />} />
                <Route path="transactions" element={<WorkInProgress title="Transactions" description="The committee ledger." />} />
                <Route path="settings" element={<AdminSettings />} />
                <Route path="monthly-funds" element={<WorkInProgress title="Monthly Funds" description="Monthly contributions by member." />} />
              </Route>
              {/* Anything unknown goes back to the public page rather than a
                  blank screen. */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </ContentProvider>
      </AuthProvider>
    </LanguageProvider>
  )
}

export default App
