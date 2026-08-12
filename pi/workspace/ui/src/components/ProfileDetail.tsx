import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useProfileDetail } from '@/lib/useProfiles'
import { useSkillNameToIdMap } from '@/lib/useSkills'
import { skillUrl, workspaceUrl } from '@/components/LandingPage'
import { navigate } from '@/lib/useLocation'
import { titleFromSlug } from '@/lib/utils'
import type { ProfileDetail as ProfileDetailType } from '@/protocol'
import { ArrowLeft, ListChecks, MessageSquareText, Sparkles } from 'lucide-react'

interface ProfileDetailProps {
  workspaceId: string
  profileName: string
  conn: 'connecting' | 'open' | 'closed'
}

export function ProfileDetail({ workspaceId, profileName, conn }: ProfileDetailProps) {
  const { data: profile, isPending, isError, error, refetch } = useProfileDetail(
    workspaceId,
    profileName,
    conn,
  )
  // Profiles reference skills by frontmatter name; the detail route is keyed
  // by directory slug, so resolve names to slugs for the skill links.
  const skillIdBySlug = useSkillNameToIdMap(workspaceId, conn)

  // Filters are in the query string (see ProfilesSection) — carry them through
  // so "Back to workspace" restores the exact list the user left.
  const back = (): void => navigate(workspaceUrl(workspaceId) + location.search)

  return (
    <main className="flex-1 overflow-y-auto p-4">
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2 text-muted-foreground"
        onClick={back}
      >
        <ArrowLeft className="size-4" />
        Back to workspace
      </Button>

      {isError && (
        <div className="mt-3 flex items-center gap-2 text-xs text-red-500">
          <span className="truncate">{error instanceof Error ? error.message : String(error)}</span>
          <Button size="xs" variant="outline" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      )}

      {isPending ? (
        <div className="mt-6 animate-pulse space-y-3">
          <div className="h-6 w-1/2 rounded bg-muted" />
          <div className="h-3 w-2/3 rounded bg-muted" />
          <div className="h-3 w-1/3 rounded bg-muted" />
          <div className="h-40 w-full rounded bg-muted" />
        </div>
      ) : profile !== undefined ? (
        <ProfileHeader
          profile={profile}
          skillIdBySlug={skillIdBySlug}
          workspaceId={workspaceId}
        />
      ) : null}
    </main>
  )
}

function ProfileHeader({
  profile,
  skillIdBySlug,
  workspaceId,
}: {
  profile: ProfileDetailType
  skillIdBySlug: Map<string, string>
  workspaceId: string
}) {
  return (
    <div className="mt-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold">{titleFromSlug(profile.name)}</h1>
          {profile.description !== '' && (
            <p className="mt-1 text-sm text-muted-foreground">{profile.description}</p>
          )}
          {(profile.model !== '' || profile.skills.length > 0) && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {profile.model !== '' && (
                <Badge variant="secondary" title="preferred model">
                  <Sparkles className="size-3" />
                  <span className="font-mono">{profile.model}</span>
                </Badge>
              )}
              {profile.skills.map((skill) => {
                const id = skillIdBySlug.get(skill)
                return id !== undefined ? (
                  <Badge
                    key={skill}
                    variant="outline"
                    asChild
                    className="hover:border-primary/40 hover:text-foreground"
                  >
                    <a
                      href={skillUrl(workspaceId, id)}
                      title={`Open skill ${skill}`}
                      onClick={(event) => {
                        event.preventDefault()
                        navigate(skillUrl(workspaceId, id))
                      }}
                    >
                      {skill}
                    </a>
                  </Badge>
                ) : (
                  <Badge key={skill} variant="outline" title={`Unknown skill: ${skill}`}>
                    {skill}
                  </Badge>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {profile.instructions !== '' && (
        <section className="mt-6">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <MessageSquareText className="size-4" />
            Instructions
          </h2>
          <div className="prose dark:prose-invert max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{profile.instructions}</ReactMarkdown>
          </div>
        </section>
      )}

      {profile.checklist.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <ListChecks className="size-4" />
            Review Checklist
          </h2>
          <ul className="space-y-1.5 text-sm">
            {profile.checklist.map((item, index) => (
              <li key={index} className="flex items-start gap-2">
                <span className="mt-0.5 block size-3.5 shrink-0 rounded border border-muted-foreground/40" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-6 text-xs text-muted-foreground">
        Stored at{' '}
        <code className="rounded bg-muted px-1">
          .agents/@montflow/profiles/{profile.name}/PROFILE.md
        </code>
      </p>
    </div>
  )
}
