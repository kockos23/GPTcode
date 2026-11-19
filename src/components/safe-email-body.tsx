import { useMemo, useState } from 'react'
import { Eye, ImageOff } from 'lucide-react'
import { sanitizeEmailHtml } from '@/lib/email-html'
import { cleanEmailPreview } from '@/lib/email-preview'

export function SafeEmailBody({ bodyHtml, bodyText, preview, title }: { bodyHtml?:string; bodyText?:string; preview:string; title:string }) {
  const [showImages,setShowImages]=useState(false)
  const document=useMemo(()=>bodyHtml?sanitizeEmailHtml(bodyHtml,showImages):'', [bodyHtml,showImages])
  if(bodyHtml)return <section className="safe-email-body"><div><strong>Formátovaný obsah e-mailu</strong><button onClick={()=>setShowImages(value=>!value)}>{showImages?<ImageOff size={14}/>:<Eye size={14}/>} {showImages?'Skryť externé obrázky':'Načítať externé obrázky'}</button></div><iframe title={'Obsah e-mailu '+title} sandbox="" referrerPolicy="no-referrer" srcDoc={document}/></section>
  const text=cleanEmailPreview(bodyText||preview)
  return <section className="safe-email-body text-only"><div><strong>Textový obsah e-mailu</strong></div><p>{text}</p></section>
}
