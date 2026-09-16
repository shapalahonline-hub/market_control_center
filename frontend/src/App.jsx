import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import Overview from './pages/Overview.jsx'
import Review from './pages/Review.jsx'
import Pipeline from './pages/Pipeline.jsx'
import Publishing from './pages/Publishing.jsx'
import Calendar from './pages/Calendar.jsx'
import Performance from './pages/Performance.jsx'
import Winners from './pages/Winners.jsx'
import Ads from './pages/Ads.jsx'
import Connectors from './pages/Connectors.jsx'

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Overview />} />
        <Route path="/review" element={<Review />} />
        <Route path="/pipeline" element={<Pipeline />} />
        <Route path="/publishing" element={<Publishing />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/performance" element={<Performance />} />
        <Route path="/winners" element={<Winners />} />
        <Route path="/ads" element={<Ads />} />
        <Route path="/connectors" element={<Connectors />} />
      </Routes>
    </Layout>
  )
}
