import { useState } from 'react'
import { logoUrl, merchantDomain } from '../lib/merchants'

// Websites whose logo didn't load (offline, or the service had none), so we don't retry on every row
const failed = new Set()

// The icon tile for a transaction or payment: the shop's logo when its name is known
// (src/lib/merchants.js), otherwise the usual emoji tile. `className` sizes and rounds the tile;
// `style` is the emoji tile's look (e.g. the category colour) and isn't used behind a logo.
export default function MerchantIcon({ name, className = '', style, children }) {
  const domain = merchantDomain(name)
  const [broken, setBroken] = useState(null) // the website that failed in this tile

  if (!domain || broken === domain || failed.has(domain)) {
    return (
      <span className={`inline-grid shrink-0 place-items-center ${className}`} style={style}>
        {children}
      </span>
    )
  }

  const fail = () => {
    failed.add(domain)
    setBroken(domain)
  }
  return (
    <span className={`inline-block shrink-0 overflow-hidden border border-line bg-white ${className}`}>
      <img
        src={logoUrl(domain)}
        alt=""
        referrerPolicy="no-referrer"
        className="size-full object-cover"
        onError={fail}
      />
    </span>
  )
}
