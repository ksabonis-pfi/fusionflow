// Authored narrative for the RingCentral Executive and Outcomes readouts. Ported
// from the standalone RingCentral Optimization agent (public/report-content.js);
// wording unchanged apart from markup (HTML entities → characters).
//
// Keyed by the 11 RingCentral layers. The content is RingCentral-specific on
// purpose: it names RingEX, RingCX, RingSense and the actual admin surfaces. A
// report that describes products the customer does not own reads as boilerplate.
import type { LayerNarrative } from "../zoom/content";

export const RC_LAYERS: Record<number, LayerNarrative> = {
  0: {
    icon: "shield", accent: "var(--s1)", tagline: "The governed foundation everything else sits on",
    whyItMatters: "Sites, numbering, emergency addressing and licence posture are the bedrock under every other outcome. When the foundation drifts, routing, billing and compliance all erode quietly from underneath — and nothing alerts you.",
    affectsNow: "Hard phones without an emergency service address cannot be located by a 911 dispatcher. Sites that do not match real locations send calls to the wrong operator and corrupt every per-site report you run afterwards.",
    improving: "Aligning each setting to its recommended state removes regulatory exposure, makes every downstream metric trustworthy, and is usually the cheapest, most certain score lift available.",
    howItHelps: "PacketFusion maps each configuration to its recommended target and hands your admins the exact RingCentral admin steps to close the gap — turning an invisible risk surface into a documented, auditable baseline.",
    roi: "Regulatory risk reduction under RAY BAUM'S Act, plus the rework avoided when reporting is built on a correct site and numbering model.",
    stakeholders: {
      company: "Protects the business from an emergency-services failure and the liability that follows.",
      department: "IT and Facilities gain an enforced, provable standard for every location.",
      team: "Admins stop firefighting one-off address and site exceptions.",
      user: "Employees can dial 911 from any device and be found.",
    },
  },
  1: {
    icon: "license", accent: "var(--s2)", tagline: "Every seat accounted for, every identity current",
    whyItMatters: "Extensions, devices and directory sync are where licence spend meets reality. Provisioning drift is the single most common source of silent waste in a RingCentral estate.",
    affectsNow: "Extensions provisioned but never activated are paid for and unused. Disabled extensions left in place distort every count and confuse routing design. Neither shows up on an invoice as waste.",
    improving: "Releasing abandoned seats returns money immediately and makes the licence position defensible at renewal. Linking agents and users to the RingEX directory removes the joiner-leaver gap.",
    howItHelps: "PacketFusion quantifies the gap, separates planned hires from abandoned seats, and gives you a release list timed to your billing cycle.",
    roi: "Direct licence cost avoidance — typically the fastest payback in the programme.",
    stakeholders: {
      company: "Stops paying for capacity nobody uses; strengthens the renewal position.",
      department: "IT regains an accurate seat count to plan and budget against.",
      team: "Admins work from a directory that matches who actually works here.",
      user: "New starters are provisioned correctly the first time.",
    },
  },
  2: {
    icon: "gears", accent: "var(--s3)", tagline: "Calls reaching the right person, first time",
    whyItMatters: "Queues, IVR menus, business hours and answering rules decide whether a caller reaches a human or a dead end. Routing is where customer experience is won or lost before anyone speaks.",
    affectsNow: "A queue with no members silently abandons every call that enters it. Business hours that do not match real operating hours send daytime callers to voicemail. Both are invisible until a customer complains.",
    improving: "Closing routing gaps converts abandoned calls into answered ones without adding headcount — the cheapest capacity increase available.",
    howItHelps: "PacketFusion surfaces every unstaffed queue and after-hours mismatch, then works through the remediation with your admins rather than handing over a list.",
    roi: "Revenue protection: every abandoned call is a customer who tried to reach you and failed.",
    stakeholders: {
      company: "Fewer lost opportunities and fewer complaints that start with “nobody answered”.",
      department: "Operations gain a routing model they can explain and defend.",
      team: "Supervisors stop manually covering queues nobody owns.",
      user: "Callers reach a person instead of a dead end.",
    },
  },
  3: {
    icon: "pulse", accent: "var(--s4)", tagline: "Calls that connect, and stay connected",
    whyItMatters: "Call failure and disconnect patterns are the clearest signal of underlying quality problems — number quality, carrier routing, device health or network readiness.",
    affectsNow: "Outbound calls that never connect waste agent time at scale and point at stale dialling data or a carrier issue. On a dialling floor the cost compounds every hour.",
    improving: "Isolating the failure pattern by destination and campaign usually reveals a small number of root causes with disproportionate impact.",
    howItHelps: "PacketFusion segments the failures, separates data-quality problems from carrier problems, and takes persistent patterns to the carrier with evidence.",
    roi: "Recovered agent productivity and fewer wasted dial attempts.",
    stakeholders: {
      company: "Protects reputation — repeated failed calls damage answer rates over time.",
      department: "Operations see where the dialling data or routing is at fault.",
      team: "Agents stop burning time on calls that were never going to connect.",
      user: "Customers are reached on the first attempt.",
    },
  },
  4: {
    icon: "heart", accent: "var(--s5)", tagline: "A workplace that works wherever people are",
    whyItMatters: "Presence, device mix and app adoption determine whether the platform is genuinely in use or merely deployed. Licences without adoption are shelfware with an invoice.",
    affectsNow: "A device estate weighted to hard phones with little softphone or mobile use signals that hybrid working is unsupported, and that the investment is not being realised.",
    improving: "Shifting the mix toward software clients cuts hardware refresh cost and unlocks the mobility the platform was bought for.",
    howItHelps: "PacketFusion benchmarks the device and presence picture, then targets the specific teams where adoption has stalled.",
    roi: "Deferred hardware spend plus the productivity of a workforce that can work anywhere.",
    stakeholders: {
      company: "Realises the value of the platform rather than paying for unused capability.",
      department: "HR and IT can support hybrid working credibly.",
      team: "Managers see who is reachable without chasing.",
      user: "Staff work from anywhere on the device they prefer.",
    },
  },
  5: {
    icon: "gauge", accent: "var(--s1)", tagline: "The experience your customers actually receive",
    whyItMatters: "Answer rate, abandonment and speed to answer are the metrics your customers feel directly. They are also the ones most often measured against the wrong denominator.",
    affectsNow: "A high missed-call rate is lost revenue arriving as a statistic. Where it concentrates in particular queues or hours, the fix is usually routing or scheduling rather than headcount.",
    improving: "Moving answer rate even a few points converts directly into conversations that would otherwise never have happened.",
    howItHelps: "PacketFusion derives these from Business Analytics with the denominators stated explicitly, so the numbers survive scrutiny in a board pack.",
    roi: "Revenue protection, quantified per point of answer rate.",
    stakeholders: {
      company: "More of the demand you already paid to generate actually reaches you.",
      department: "Service leaders get defensible numbers instead of anecdotes.",
      team: "Supervisors can see which queues and hours actually need cover.",
      user: "Customers get through, quickly.",
    },
  },
  6: {
    icon: "chat", accent: "var(--s2)", tagline: "Meeting customers on the channel they chose",
    whyItMatters: "SMS, MMS, fax displacement and digital channels are where customer preference has already moved. Capability that is licensed but unused is a gap between what you bought and what you offer.",
    affectsNow: "A2P campaigns without opt-out handling carry regulatory exposure. Fax still running on analogue lines carries avoidable cost and risk.",
    improving: "Activating messaging shifts volume off voice to a cheaper, more convenient channel and improves response rates.",
    howItHelps: "PacketFusion reviews campaign health, opt-out posture and fax displacement, and sequences the migration.",
    roi: "Lower cost per contact and reduced compliance exposure.",
    stakeholders: {
      company: "Meets customers where they are; reduces regulatory risk.",
      department: "Marketing and Service gain a compliant outbound channel.",
      team: "Agents handle more conversations concurrently.",
      user: "Customers get a text instead of being kept on hold.",
    },
  },
  7: {
    icon: "spark", accent: "var(--s3)", tagline: "Collaboration that replaces the meeting you did not need",
    whyItMatters: "Video and Team Chat adoption shows whether collaboration has genuinely moved onto the platform or is scattered across tools you do not control.",
    affectsNow: "Low meeting and chat usage alongside full licensing means staff are collaborating somewhere else — usually somewhere unmanaged and unrecorded.",
    improving: "Consolidating collaboration reduces tool sprawl, cuts spend on overlapping licences, and brings conversations back inside your retention policy.",
    howItHelps: "PacketFusion identifies where collaboration actually happens today and builds a consolidation path that staff will accept.",
    roi: "Retired overlapping subscriptions plus recovered governance.",
    stakeholders: {
      company: "One platform to secure, retain and pay for.",
      department: "IT removes shadow tooling from the estate.",
      team: "Teams stop switching between apps to reach each other.",
      user: "One place to meet, message and share.",
    },
  },
  8: {
    icon: "bot", accent: "var(--s4)", tagline: "A contact centre designed, not accumulated",
    whyItMatters: "RingCX queues, agents, skills and dialling configuration are where contact-centre intent meets what was actually built. Design drift here is expensive and invisible.",
    affectsNow: "Active queues with no agent access cannot answer anything. Outbound campaigns without a DNC list are a compliance exposure, not an operational one.",
    improving: "A clean queue, skill and agent model makes routing predictable, reporting meaningful, and future change cheap.",
    howItHelps: "PacketFusion audits the live RingCX configuration — gates, agent groups, dial groups, DNC posture — and separates deliberate design from accumulated drift.",
    roi: "Compliance risk removed, plus the efficiency of routing that matches how the business actually works.",
    stakeholders: {
      company: "Protects against a DNC breach and the penalties attached.",
      department: "Contact-centre leadership get a model they can reorganise around.",
      team: "Supervisors stop working around queues that were never finished.",
      user: "Callers reach an agent with the right skills.",
    },
  },
  9: {
    icon: "bot", accent: "var(--s5)", tagline: "AI that earns its licence",
    whyItMatters: "RingSense / AI Conversation Expert turns recorded conversations into coaching, compliance and insight. Its value is entirely gated on licences being assigned to the people whose calls matter.",
    affectsNow: "Recordings generating no insights mean the licence is bought but not working. Coaching stays anecdotal and quality review stays manual.",
    improving: "Assigning licences to the right users converts every recorded call into reviewable insight — summaries, sentiment and next steps — without adding review time.",
    howItHelps: "PacketFusion measures insight coverage against recordings, identifies who should hold a licence, and sets the recording policy that feeds it.",
    roi: "Coaching efficiency and quality coverage without adding QA headcount.",
    stakeholders: {
      company: "Turns conversations into an asset rather than an archive.",
      department: "Quality and Enablement get evidence instead of impressions.",
      team: "Supervisors coach from the actual conversation.",
      user: "Customers deal with better-prepared people.",
    },
  },
  10: {
    icon: "coins", accent: "var(--s1)", tagline: "Proving the platform is worth what it costs",
    whyItMatters: "Licence utilisation, recording discipline and compliance posture are where the platform is justified to whoever signs the renewal.",
    affectsNow: "Utilisation gaps and undefined recording policy are the two findings most likely to surface at the wrong moment — a renewal negotiation or an audit.",
    improving: "A documented, measured position turns the renewal from a negotiation about price into a conversation about value.",
    howItHelps: "PacketFusion tracks the value position run over run, so the trajectory is evidence rather than assertion.",
    roi: "Direct licence savings plus a defensible renewal position.",
    stakeholders: {
      company: "Spend that can be explained and defended.",
      department: "Finance and IT agree on what the platform costs and returns.",
      team: "Managers see their own team's utilisation.",
      user: "Investment goes to capability people actually use.",
    },
  },
};
