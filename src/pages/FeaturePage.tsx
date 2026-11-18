import { ArrowLeft, Construction } from 'lucide-react'
import { Link } from 'react-router-dom'

export function FeaturePage({ feature, description }: { feature: string; description: string }) {
  return (
    <div className="page feature-page">
      <div className="eyebrow">CHESS UNLIMITED / MODULE</div>
      <h1>{feature}</h1>
      <p className="feature-description">{description}</p>
      <div className="feature-empty">
        <div className="feature-empty-icon"><Construction size={25} /></div>
        <div className="eyebrow">MODULE SCAFFOLD READY</div>
        <h2>Good things take great moves.</h2>
        <p>This module is mapped into the application architecture. Its functionality will be implemented in the next development phases.</p>
        <Link to="/" className="back-link"><ArrowLeft size={15} /> Back to overview</Link>
      </div>
    </div>
  )
}
