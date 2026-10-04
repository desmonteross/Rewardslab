import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Minus, Plus } from 'lucide-react'
import { requireSession } from '@/lib/session'
import { Card, PageHeader } from '@/components/ui'
import { FAQS } from '@/components/help-content'

export const metadata = { title: 'FAQs' }
export const dynamic = 'force-dynamic'

export default async function FaqPage() {
  const session = await requireSession()
  // Tenants have their own help page inside the portal.
  if (session.role === 'TENANT') redirect('/portal/help')

  return (
    <>
      <PageHeader
        title="Frequently asked questions"
        description="Quick answers to the questions people ask most. Click a question to open it."
        actions={
          <Link href="/help" className="btn-secondary">
            Read the guides
          </Link>
        }
      />

      <Card padded={false}>
        <div className="divide-y divide-line">
          {FAQS.map((faq) => (
            <details key={faq.question} className="group px-5 py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-ink">
                {faq.question}
                <Plus className="h-4 w-4 shrink-0 text-muted group-open:hidden" aria-hidden />
                <Minus className="hidden h-4 w-4 shrink-0 text-brand group-open:block" aria-hidden />
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-muted">{faq.answer}</p>
            </details>
          ))}
        </div>
      </Card>
    </>
  )
}
