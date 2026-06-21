import { Users, Crown, UserCheck, UserX, Shield, Unlock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AnnotationMode, RoomMember } from "@shared/signal";

interface MemberPanelProps {
  members: RoomMember[];
  senderId: string | null;
  myClientId: string | null;
  annotationMode: AnnotationMode;
  authorizedAnnotators: string[];
  isHost: boolean;
  onSetMode: (mode: AnnotationMode) => void;
  onAuthorize: (clientId: string) => void;
  onRevoke: (clientId: string) => void;
  className?: string;
}

function shortId(id: string): string {
  return id.slice(0, 6).toUpperCase();
}

export default function MemberPanel({
  members,
  senderId,
  myClientId,
  annotationMode,
  authorizedAnnotators,
  isHost,
  onSetMode,
  onAuthorize,
  onRevoke,
  className,
}: MemberPanelProps) {
  return (
    <div className={cn("panel flex flex-col gap-3 p-4", className)}>
      <div className="flex items-center justify-between">
        <span className="label flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5" />
          房间成员 · {members.length}
        </span>
      </div>

      {isHost && (
        <div className="flex items-center gap-2 rounded-lg border border-ink-700/50 bg-ink-900/50 p-2">
          <span className="text-[11px] text-fg-muted">标注模式</span>
          <div className="ml-auto flex overflow-hidden rounded-md border border-ink-700/50 text-[10px]">
            <button
              onClick={() => onSetMode("host")}
              className={cn(
                "flex items-center gap-1 px-2 py-1 transition-colors",
                annotationMode === "host"
                  ? "bg-signal/20 text-signal"
                  : "text-fg-muted hover:bg-ink-800",
              )}
            >
              <Shield className="h-3 w-3" />
              主持人
            </button>
            <button
              onClick={() => onSetMode("free")}
              className={cn(
                "flex items-center gap-1 px-2 py-1 transition-colors",
                annotationMode === "free"
                  ? "bg-signal/20 text-signal"
                  : "text-fg-muted hover:bg-ink-800",
              )}
            >
              <Unlock className="h-3 w-3" />
              自由
            </button>
          </div>
        </div>
      )}

      <ul className="flex flex-col gap-1.5">
        {members.map((m) => {
          const isHostMember = m.clientId === senderId;
          const isMe = m.clientId === myClientId;
          const isAuthorized = authorizedAnnotators.includes(m.clientId);
          return (
            <li
              key={m.clientId}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors",
                isMe ? "bg-signal/5 ring-1 ring-signal/20" : "hover:bg-ink-800/60",
              )}
            >
              {isHostMember ? (
                <Crown className="h-3.5 w-3.5 text-amber-400" aria-label="主持人" />
              ) : (
                <Users className="h-3.5 w-3.5 text-fg-muted" />
              )}
              <div className="flex flex-col">
                <span className="font-mono text-[11px] text-fg">
                  {shortId(m.clientId)}
                  {isMe && <span className="ml-1 text-[9px] text-signal">(我)</span>}
                </span>
                <span className="font-mono text-[9px] text-fg-muted">
                  {m.role === "sender" ? "A 端 · 推流" : "B 端 · 拉流"}
                </span>
              </div>
              <div className="ml-auto flex items-center gap-1">
                {annotationMode === "host" && !isHostMember && isHost && (
                  <button
                    onClick={() =>
                      isAuthorized ? onRevoke(m.clientId) : onAuthorize(m.clientId)
                    }
                    title={isAuthorized ? "撤销标注权限" : "授权标注"}
                    className={cn(
                      "flex h-6 w-6 items-center justify-center rounded transition-colors",
                      isAuthorized
                        ? "bg-signal/20 text-signal hover:bg-signal/30"
                        : "text-fg-muted hover:bg-ink-700 hover:text-fg",
                    )}
                  >
                    {isAuthorized ? (
                      <UserCheck className="h-3.5 w-3.5" />
                    ) : (
                      <UserX className="h-3.5 w-3.5" />
                    )}
                  </button>
                )}
                {isAuthorized && (
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 font-mono text-[9px]",
                      annotationMode === "free"
                        ? "bg-emerald-500/10 text-emerald-400"
                        : "bg-signal/10 text-signal",
                    )}
                  >
                    可标注
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
