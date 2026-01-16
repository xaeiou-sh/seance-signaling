import { forwardRef } from "react";
import { Card } from "@/components/CardSwap";

export type ConnectionType =
  | 'local'
  | { tailscale: string } // machine name over tailscale
  | { cloudflare: string } // cloudflare workers
  | string; // region names like "us-west-2"

export interface AgentCardProps {
  name: string;
  activity: string;
  connection?: ConnectionType;
  style?: React.CSSProperties;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
}

const ConnectionBadge = ({ connection }: { connection?: ConnectionType }) => {
  if (!connection) return null;

  if (typeof connection === 'object' && 'tailscale' in connection) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-zinc-500">
        <span>{connection.tailscale} over</span>
        <img src="/logos/tailscale.svg" alt="Tailscale" className="h-3 w-auto" />
        <span>tailscale</span>
      </div>
    );
  }

  if (typeof connection === 'object' && 'cloudflare' in connection) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-zinc-500">
        <img src="/logos/cloudflare.svg" alt="Cloudflare" className="h-3 w-auto" />
        <span>running on worker</span>
      </div>
    );
  }

  return (
    <div className="text-xs text-zinc-500">
      {connection}
    </div>
  );
};

export const ClaudeCard = forwardRef<HTMLDivElement, AgentCardProps>(
  ({ name, activity, connection, style, onClick }, ref) => (
    <Card ref={ref} className="flex flex-col gap-4 p-6" style={style} onClick={onClick}>
      <pre className="font-mono text-lg leading-none text-flame text-glow-flame">{` ▐▛███▜▌
▝▜█████▛▘
  ▘▘ ▝▝`}</pre>
      <div>
        <div className="font-mono text-3xl text-flame">{name}</div>
        <ConnectionBadge connection={connection} />
        <div className="mt-2 flex items-center gap-2 text-lg text-pure">
          <div className="h-3 w-3 animate-pulse rounded-full bg-flame"></div>
          {activity}
        </div>
      </div>
    </Card>
  )
);

export const GeminiCard = forwardRef<HTMLDivElement, AgentCardProps>(
  ({ name, activity, connection, style, onClick }, ref) => (
    <Card ref={ref} className="flex flex-col justify-between p-4" style={style} onClick={onClick}>
      <pre className="font-mono text-[4px] leading-none text-[#4285F4]">{` ███            █████████  ██████████ ██████   ██████ █████ ██████   █████ █████
░░░███         ███░░░░░███░░███░░░░░█░░██████ ██████ ░░███ ░░██████ ░░███ ░░███
  ░░░███      ███     ░░░  ░███  █ ░  ░███░█████░███  ░███  ░███░███ ░███  ░███
    ░░░███   ░███          ░██████    ░███░░███ ░███  ░███  ░███░░███░███  ░███
     ███░    ░███    █████ ░███░░█    ░███ ░░░  ░███  ░███  ░███ ░░██████  ░███
   ███░      ░░███  ░░███  ░███ ░   █ ░███      ░███  ░███  ░███  ░░█████  ░███
 ███░         ░░█████████  ██████████ █████     █████ █████ █████  ░░█████ █████
░░░            ░░░░░░░░░  ░░░░░░░░░░ ░░░░░     ░░░░░ ░░░░░ ░░░░░    ░░░░░ ░░░░░`}</pre>
      <div>
        <div className="font-mono text-lg text-[#4285F4]">{name}</div>
        <ConnectionBadge connection={connection} />
        <div className="mt-1 flex items-center gap-2 text-sm text-pure">
          <div className="h-2 w-2 animate-pulse rounded-full bg-[#4285F4]"></div>
          {activity}
        </div>
      </div>
    </Card>
  )
);

export const CodexCard = forwardRef<HTMLDivElement, AgentCardProps>(
  ({ name, activity, connection, style, onClick }, ref) => (
    <Card ref={ref} className="flex flex-col justify-between p-4" style={style} onClick={onClick}>
      <img src="/logos/openai.svg" alt="OpenAI" className="h-16 w-auto object-contain self-start" />
      <div>
        <div className="font-mono text-lg text-[#10A37F]">{name}</div>
        <ConnectionBadge connection={connection} />
        <div className="mt-1 flex items-center gap-2 text-sm text-pure">
          <div className="h-2 w-2 animate-pulse rounded-full bg-[#10A37F]"></div>
          {activity}
        </div>
      </div>
    </Card>
  )
);

export const GLMCard = forwardRef<HTMLDivElement, AgentCardProps>(
  ({ name, activity, connection, style, onClick }, ref) => (
    <Card ref={ref} className="flex flex-col justify-between p-4" style={style} onClick={onClick}>
      <img src="/logos/glm.png" alt="GLM" className="h-16 w-auto object-contain self-start" />
      <div>
        <div className="font-mono text-lg text-[#1E88E5]">{name}</div>
        <ConnectionBadge connection={connection} />
        <div className="mt-1 flex items-center gap-2 text-sm text-pure">
          <div className="h-2 w-2 animate-pulse rounded-full bg-[#1E88E5]"></div>
          {activity}
        </div>
      </div>
    </Card>
  )
);

export const QwenCard = forwardRef<HTMLDivElement, AgentCardProps>(
  ({ name, activity, connection, style, onClick }, ref) => (
    <Card ref={ref} className="flex flex-col justify-between p-4" style={style} onClick={onClick}>
      <img src="/logos/qwen.png" alt="Qwen" className="h-16 w-auto object-contain self-start" />
      <div>
        <div className="font-mono text-lg text-[#6366F1]">{name}</div>
        <ConnectionBadge connection={connection} />
        <div className="mt-1 flex items-center gap-2 text-sm text-pure">
          <div className="h-2 w-2 animate-pulse rounded-full bg-[#6366F1]"></div>
          {activity}
        </div>
      </div>
    </Card>
  )
);

export const DeepSeekCard = forwardRef<HTMLDivElement, AgentCardProps>(
  ({ name, activity, connection, style, onClick }, ref) => (
    <Card ref={ref} className="flex flex-col justify-between p-4" style={style} onClick={onClick}>
      <img src="/logos/deepseek.png" alt="DeepSeek" className="h-16 w-auto object-contain self-start" />
      <div>
        <div className="font-mono text-lg text-[#4D6BFE]">{name}</div>
        <ConnectionBadge connection={connection} />
        <div className="mt-1 flex items-center gap-2 text-sm text-pure">
          <div className="h-2 w-2 animate-pulse rounded-full bg-[#4D6BFE]"></div>
          {activity}
        </div>
      </div>
    </Card>
  )
);

export const CloudflareCard = forwardRef<HTMLDivElement, AgentCardProps>(
  ({ name, activity, connection, style, onClick }, ref) => (
    <Card ref={ref} className="flex flex-col justify-between p-4" style={style} onClick={onClick}>
      <img src="/logos/cloudflare.svg" alt="Cloudflare" className="h-12 w-auto object-contain self-start" />
      <div>
        <div className="font-mono text-lg text-[#F6821F]">{name}</div>
        <ConnectionBadge connection={connection} />
        <div className="mt-1 flex items-center gap-2 text-sm text-pure">
          <div className="h-2 w-2 animate-pulse rounded-full bg-[#F6821F]"></div>
          {activity}
        </div>
      </div>
    </Card>
  )
);
