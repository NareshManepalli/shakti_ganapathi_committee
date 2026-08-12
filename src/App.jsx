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
import MonthlyFunds from './admin/pages/MonthlyFunds'
import Transactions from './admin/pages/Transactions'
import AdminGallery from './admin/pages/Gallery'
import AdminAbout from './admin/pages/About'
import AdminMandapam from './admin/pages/Mandapam'
import AdminSchedule from './admin/pages/Schedule'
import AdminMembers from './admin/pages/Members'
import './App.css'
import { SectionBoundary } from './components/SectionState';
import { useCopyGuard } from './components/useCopyGuard';

// The public scroll page. Everything a visitor sees lives here.
// Each section is wrapped on its own. React tears down the whole tree when a
// render throws and nothing catches it, so one bad row used to leave the
// visitor with a blank white page — no header, no other section, nothing to
// click. Per-section boundaries keep the damage the size of the section, and
// the header, the rest of the page and the funds gate all survive it.
const guard = (label, node) => (
  <SectionBoundary label={label}>{node}</SectionBoundary>
);

const PublicSite = () => {
  // Mounted here rather than at the router, so it covers the public page and
  // the sign-in screens but never the portal — see useCopyGuard.
  useCopyGuard();

  return (
  <div className="App">
    {guard('Header', <Header />)}
    {guard('Home', <Home />)}
    {guard('About', <About />)}
    {guard('Committee', <Committee />)}
    {guard('Schedule', <Schedule />)}
    {guard('Gallery', <Gallery />)}
    {/* Shares one background with the section above it — see .page-tail */}
    <div className="page-tail">
      {guard('Mandapam', <MandapamLocation />)}
      {/* Committee-only doorway — the last thing on the page, deliberately
          not in the nav. */}
      {guard('Committee Funds', <FundsGate />)}
    </div>
    {guard('Footer', <Footer />)}
  </div>
  );
};

// Bounces to the login page unless a session is present. The server checks the
// token on every request too — this only decides what to render.
const RequireAuth = ({ children }) => {
  const { isAuthed } = useAuth()
  return isAuthed ? children : <Navigate to="/funds" replace />
}

// The editing screens, for adm_in = 1 only.
//
// The sidebar already leaves these out for a funds-only member, but a menu is
// not a lock: typing the path reached the screen, and it would sit there
// showing an error from an endpoint that had refused it. Nothing leaked — the
// Content Web App gates its reads on adm_in as well — but a member was being
// shown a door that was never theirs. They go back to the one screen they came
// for instead.
const RequireAdmin = ({ children }) => {
  const { member } = useAuth()
  return member && member.isAdmin
    ? children
    : <Navigate to="/admin/monthly-funds" replace />
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
                <Route path="about" element={<RequireAdmin><AdminAbout /></RequireAdmin>} />
                <Route path="members" element={<RequireAdmin><AdminMembers /></RequireAdmin>} />
                <Route path="gallery" element={<RequireAdmin><AdminGallery /></RequireAdmin>} />
                <Route path="schedule" element={<RequireAdmin><AdminSchedule /></RequireAdmin>} />
                <Route path="mandapam" element={<RequireAdmin><AdminMandapam /></RequireAdmin>} />
                <Route path="transactions" element={<Transactions />} />
                {/* Settings retired: the festival date it edited is now read
                    from the schedule sheet's day 1, so the screen had nothing
                    left to change. */}
                <Route path="monthly-funds" element={<MonthlyFunds />} />
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
