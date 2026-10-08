import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import { requireSession } from '@/lib/session'
import { can, ROLE_LABELS } from '@/lib/rbac'
import { Card, PageHeader } from '@/components/ui'
import { GETTING_AROUND, HELP_GROUPS } from '@/components/help-content'
import { GuideContents } from '@/components/guide-contents'

export const metadata = { title: 'Guides' }
export const dynamic = 'force-dynamic'

/**
 * Open to every signed-in staff role. Guides are filtered to the screens the
 * person can open, so nobody reads instructions for a page they will be
 * refused.
 */
export default async function HelpPage() {
  const session = await requireSession()
  // Tenants have their own help page inside the portal.
  if (session.role === 'TENANT') redirect('/portal/help')
  const platformOnly = !session.organizationId

  const groups = platformOnly
    ? []
    : HELP_GROUPS.map((group) => ({
        ...group,
        guides: group.guides.filter(
          (guide) => can(session, guide.permission) && (!guide.roles || guide.roles.includes(session.role)),
        ),
      })).filter((group) => group.guides.length > 0)

  const contents = [
    { id: 'getting-around', label: 'Getting around' },
    ...groups.map((group) => ({ id: `group-${group.label.toLowerCase().replace(/\s+/g, '-')}`, label: group.label })),
  ]

  return (
    <>
      <PageHeader
        title="Guides"
        description={`How each part of the system works and how to move around it. Shown for your role: ${ROLE_LABELS[session.role] ?? session.role}.`}
      />

      <div className="grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <GuideContents entries={contents} />

        <div className="min-w-0 space-y-8">
          <section id="getting-around" className="scroll-mt-20">
            <h2 className="mb-3 text-lg font-semibold text-ink">Getting around</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {GETTING_AROUND.map((topic) => (
                <Card key={topic.title} title={topic.title}>
                  <ul className="list-disc space-y-1.5 pl-4 text-sm leading-relaxed text-muted">
                    {topic.points.map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                </Card>
              ))}
            </div>
          </section>

          {groups.map((group) => (
            <section key={group.label} id={`group-${group.label.toLowerCase().replace(/\s+/g, '-')}`} className="scroll-mt-20">
              <h2 className="mb-3 text-lg font-semibold text-ink">{group.label}</h2>
              <div className="space-y-4">
                {group.guides.map((guide) => (
                  <Card key={guide.id}>
                    <div id={guide.id} className="scroll-mt-20">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="text-base font-semibold text-ink">{guide.title}</h3>
                          <p className="mt-1 text-sm text-muted">{guide.summary}</p>
                        </div>
                        <Link href={guide.href} className="btn-secondary shrink-0">
                          Open {guide.title.split(' ')[0]}
                          <ArrowRight className="h-4 w-4" aria-hidden />
                        </Link>
                      </div>
                      <p className="label mb-1.5 mt-4">How it works</p>
                      <ol className="list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-muted">
                        {guide.steps.map((step) => (
                          <li key={step}>{step}</li>
                        ))}
                      </ol>
                      {guide.tips && guide.tips.length > 0 && (
                        <div className="mt-4 rounded-lg bg-canvas px-3 py-2.5">
                          <p className="label mb-1">Good to know</p>
                          <ul className="space-y-1 text-sm leading-relaxed text-muted">
                            {guide.tips.map((tip) => (
                              <li key={tip}>{tip}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          ))}

        </div>
      </div>
    </>
  )
}
