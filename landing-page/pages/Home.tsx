import { Link } from "react-router-dom";
import { clsx } from "clsx";
import { Navigation } from "@/components/navigation";
import { HeroBackground } from "@/components/HeroBackground";
import { CursorOverlay } from "@/components/CursorOverlay";
import { Button } from "@/components/ui/button";
import TextType from "@/components/TextType";
import CardSwap from "@/components/CardSwap";
import { ClaudeCard } from "@/components/AgentCards";
import { downloadButtonStyle, waitlistButtonStyle } from "@/components/buttons/ButtonStyles";
import { ArrowRight, Download } from "lucide-react";
import { GiCrystalBall } from "react-icons/gi";
import { posthog } from "@/lib/posthog";

export default function Home() {
  const handleWaitlistClick = () => {
    posthog.capture('join_waitlist_clicked', {
      location: 'hero_section',
    });
  };

  const handleHeroDownloadClick = () => {
    posthog.capture('download_hero_clicked', {
      location: 'hero_section',
    });
  };
  return (
    <div className="min-h-screen bg-void">
      {/* Navigation */}
      <Navigation />

      {/* Hero Section with contained background */}
      <section className="relative overflow-hidden">
        {/* Cursor Overlay - constrained to hero */}
        <CursorOverlay />
        {/* Animated Background - contained to hero */}
        <HeroBackground />

        <div className="relative z-10 mx-auto max-w-3xl px-4 py-24 sm:px-6 sm:py-32 lg:py-40">
          <div className="text-center">
            {/* Main Heading */}
            <h1 className="mb-8 min-h-[4.5rem] text-3xl font-bold tracking-tight text-pure sm:min-h-[3.5rem] sm:text-4xl lg:min-h-[4rem] lg:text-5xl">
              Turn{" "}
              <span className="text-flame text-glow-flame">
                claude code
              </span>{" "}<br/>
              into{" "}
              <TextType
                text={["shared context", "collaboration sessions", "team infrastructure", "remote workflows"]}
                className="text-flame"
                showCursor={true}
                cursorCharacter="|"
                cursorClassName="text-flame"
                typingSpeed={90}
                deletingSpeed={40}
                pauseDuration={2000}
                loop={true}
              />
            </h1>

            {/* Description */}
            <p className="mx-auto mb-12 max-w-2xl text-lg leading-relaxed text-mist sm:text-xl">
              <span className=" text-flame text-glow-flame ">
                Seance
              </span>{" "}
              is a meta harness that makes your claude sessions feel like magic.<br/>{" "}
              <span className="text-pure">Its like spooky action, together.</span>
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <a
                href="https://forms.gle/6Br64PFmTZSD4qjd9"
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleWaitlistClick}
              >
                <Button
                  size="xl"
                  className={clsx(waitlistButtonStyle)}
                >
                  <GiCrystalBall className="h-8 w-8" />
                  join the waitlist
                  <ArrowRight className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" />
                </Button>
              </a>
              <Link to="/download" onClick={handleHeroDownloadClick}>
                <Button
                  size="xl"
                  className={clsx(downloadButtonStyle)}
                >
                  <Download className="h-5 w-5" />
                  Download Nightly PreAlpha
                  <ArrowRight className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" />
                </Button>
              </Link>
            </div>

          </div>
        </div>
      </section>

      {/* Multi-Agent Section */}
      <section className="relative overflow-hidden py-24 sm:py-32">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex flex-col items-center gap-12 md:flex-row md:gap-16 md:items-start">
            {/* Copy */}
            <div className="relative z-10 flex-1 text-center md:text-left">
              <h2 className="mb-6 text-2xl font-bold tracking-tight text-pure sm:text-3xl lg:text-4xl">
                Orchestrate Agents{" "}
                <span className="text-flame text-glow-flame">Everywhere</span>
              </h2>
              <p className="text-lg leading-relaxed text-mist">
                From your local machine to your kubernetes cluster, and even on the edge. Create, manage, and operate agents on any system with your team.{" "}
                <span className="text-xl text-flame">Seance</span>{" "}
                networks them all so you don't have to.
              </p>
            </div>

            {/* CardSwap */}
            <div className="relative h-[500px] w-full flex-1 md:h-[500px] translate-y-16 md:translate-y-0 md:-translate-x-48">
              <CardSwap
                cardDistance={50}
                verticalDistance={50}
                delay={5000}
                pauseOnHover={true}
                width={400}
                height={250}
              >
                <ClaudeCard name="Atlas" activity="Designing system structure..." connection="local" />
                {/* <QwenCard name="Echo" activity="Processing natural language..." connection={{ tailscale: "nyx" }} /> */}
                <ClaudeCard name="Echo" activity="Processing natural language..." connection={{ tailscale: "nyx" }} />
                {/* <GeminiCard name="Forge" activity="Writing React components..." connection="us-west-2" /> */}
                <ClaudeCard name="Forge" activity="Writing React components..." connection="us-west-2" />
                {/* <DeepSeekCard name="Depth" activity="Deep code analysis..." connection={{ tailscale: "helios" }} /> */}
                <ClaudeCard name="Depth" activity="Deep code analysis..." connection={{ tailscale: "helios" }} />
                {/* <CodexCard name="Sentinel" activity="Checking for vulnerabilities..." connection="us-east-1" /> */}
                <ClaudeCard name="Sentinel" activity="Checking for vulnerabilities..." connection="us-east-1" />
                {/* <GLMCard name="Nexus" activity="Coordinating agent tasks..." connection={{ tailscale: "luna" }} /> */}
                <ClaudeCard name="Nexus" activity="Coordinating agent tasks..." connection={{ tailscale: "luna" }} />
                <ClaudeCard name="Trigger" activity="Handling triggered actions..." connection={{ cloudflare: "dispatch" }} />
                <ClaudeCard name="Specter" activity="Categorizing malware samples..." connection={{ cloudflare: "orchestrate" }} />
              </CardSwap>
            </div>
          </div>
        </div>
      </section>

      {/* Screenshots Section */}
        <div className="mx-auto max-w-4xl px-4 pb-24 sm:px-6">
          <h2 className="mb-12 text-center text-2xl font-bold tracking-tight text-pure sm:text-3xl">
            See It In <span className="text-flame text-glow-flame">Action</span>
          </h2>

          <div className="space-y-24">
            {/* Whiteboards - Image left, copy right */}
            <div className="flex flex-col items-center gap-8 md:flex-row">
              <div className="flex-1">
                <div className="overflow-hidden rounded-lg border-4 border-flame border-glow-flame">
                  <img
                    src="/screenshots/whiteboards.jpeg"
                    alt="Whiteboards"
                    className="w-full"
                  />
                </div>
              </div>
              <div className="flex-1 text-center md:text-left">
                <h3 className="mb-4 text-xl font-bold text-pure sm:text-2xl">
                  Design Together, Build Faster
                </h3>
                <p className="text-mist leading-relaxed">
                  Sketch out your ideas on collaborative whiteboards. Seance watches your design sessions in real-time, understanding your intent and translating rough concepts into structured code architecture.
                </p>
              </div>
            </div>

            {/* Multiple Windows - Copy left, image right */}
            <div className="flex flex-col-reverse items-center gap-8 md:flex-row">
              <div className="flex-1 text-center md:text-right">
                <h3 className="mb-4 text-xl font-bold text-pure sm:text-2xl">
                  Context Across Every Window
                </h3>
                <p className="text-mist leading-relaxed">
                  Work naturally across multiple windows—docs, diagrams, references, and code. Seance synthesizes context from everything on your screen to generate code that actually fits your project.
                </p>
              </div>
              <div className="flex-1">
                <div className="overflow-hidden rounded-lg border-4 border-phantom border-glow-phantom">
                  <img
                    src="/screenshots/multiple-windows.jpeg"
                    alt="Multiple Windows"
                    className="w-full"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
    </div>
  );
}