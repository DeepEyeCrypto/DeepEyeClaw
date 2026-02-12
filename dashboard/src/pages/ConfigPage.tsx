import { useState } from "react";
import {
  Save,
  RotateCcw,
  Shield,
  DollarSign,
  Cpu,
  Database,
  Bell,
} from "lucide-react";
import { ChartCard } from "../components/ChartCard";

interface ConfigSection {
  id: string;
  label: string;
  icon: React.ReactNode;
}

const SECTIONS: ConfigSection[] = [
  { id: "budget", label: "Budget Limits", icon: <DollarSign size={16} /> },
  { id: "routing", label: "Routing Strategy", icon: <Cpu size={16} /> },
  { id: "cache", label: "Cache Settings", icon: <Database size={16} /> },
  { id: "alerts", label: "Alert Thresholds", icon: <Bell size={16} /> },
  { id: "security", label: "Security & Auth", icon: <Shield size={16} /> },
];

export function ConfigPage() {
  const [activeSection, setActiveSection] = useState("budget");
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text">Configuration</h1>
          <p className="text-sm text-text-muted mt-1">Gateway settings, budgets, and routing policies</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-text-muted bg-surface border border-border hover:bg-surface-light transition-colors">
            <RotateCcw size={13} />
            Reset Defaults
          </button>
          <button
            onClick={handleSave}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium transition-all ${
              saved
                ? "bg-secondary text-white"
                : "bg-primary text-white hover:bg-primary-dark shadow-md shadow-primary/20"
            }`}
          >
            <Save size={13} />
            {saved ? "Saved ✓" : "Save Changes"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Section nav */}
        <div className="lg:col-span-1">
          <div className="glass-card p-3 space-y-1">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => setActiveSection(s.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-left transition-all ${
                  activeSection === s.id
                    ? "bg-primary/15 text-primary"
                    : "text-text-muted hover:text-text hover:bg-surface-light/50"
                }`}
              >
                {s.icon}
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Config forms */}
        <div className="lg:col-span-3">
          {activeSection === "budget" && (
            <ChartCard title="Budget Limits" icon="💰">
              <div className="space-y-5">
                <ConfigField label="Daily Limit ($)" defaultValue="5.00" hint="Maximum daily API spending across all providers" />
                <ConfigField label="Weekly Limit ($)" defaultValue="30.00" hint="Rolling 7-day maximum spend" />
                <ConfigField label="Monthly Limit ($)" defaultValue="100.00" hint="Calendar month maximum spend" />
                <ConfigToggle label="Enable Emergency Mode" defaultChecked hint="Automatically switch to cheapest models when budget exceeds 95%" />
                <ConfigField label="Emergency Threshold (%)" defaultValue="95" hint="Budget percentage that triggers emergency mode" />
                <ConfigMultiSelect
                  label="Emergency — Disable Providers"
                  options={["Anthropic", "Perplexity", "OpenAI"]}
                  defaults={["Anthropic"]}
                  hint="Providers to disable when emergency mode activates"
                />
              </div>
            </ChartCard>
          )}

          {activeSection === "routing" && (
            <ChartCard title="Routing Strategy" icon="🧠">
              <div className="space-y-5">
                <ConfigSelect
                  label="Default Strategy"
                  options={["priority", "cost-optimized", "cascade", "emergency"]}
                  defaultValue="cascade"
                  hint="How the router selects providers for each query"
                />
                <ConfigToggle label="Auto-detect Complexity" defaultChecked hint="Use query classifier to determine routing" />
                <ConfigToggle label="Real-time Detection" defaultChecked hint="Detect queries needing live data and route to Perplexity" />
                <ConfigField label="Cascade Quality Threshold" defaultValue="7" hint="Minimum quality score (1-10) before escalating to next model" />
                <ConfigField label="Max Cascade Steps" defaultValue="3" hint="Maximum number of model attempts in cascade strategy" />
              </div>
            </ChartCard>
          )}

          {activeSection === "cache" && (
            <ChartCard title="Cache Settings" icon="💾">
              <div className="space-y-5">
                <ConfigToggle label="Enable Semantic Cache" defaultChecked hint="Cache responses and match similar queries" />
                <ConfigField label="Default TTL (seconds)" defaultValue="3600" hint="Default time-to-live for cached entries" />
                <ConfigField label="Real-time TTL (seconds)" defaultValue="60" hint="TTL for queries flagged as needing fresh data" />
                <ConfigField label="Similarity Threshold" defaultValue="0.85" hint="Minimum cosine similarity for cache hit (0.0 — 1.0)" />
                <ConfigField label="Max Memory (MB)" defaultValue="1024" hint="Maximum memory allocation for cache storage" />
                <ConfigToggle label="Skip Cache for Creative" defaultChecked hint="Always bypass cache for creative/writing queries" />
              </div>
            </ChartCard>
          )}

          {activeSection === "alerts" && (
            <ChartCard title="Alert Thresholds" icon="🔔">
              <div className="space-y-5">
                <ConfigField label="Budget Warning (%)" defaultValue="75" hint="Show warning when budget usage exceeds this percentage" />
                <ConfigField label="Budget Critical (%)" defaultValue="90" hint="Show critical alert at this usage level" />
                <ConfigField label="API Timeout (ms)" defaultValue="30000" hint="Alert when API response time exceeds this value" />
                <ConfigField label="Error Rate (%)" defaultValue="5" hint="Alert when provider error rate exceeds this threshold" />
                <ConfigToggle label="Email Notifications" defaultChecked={false} hint="Send email alerts for critical events" />
                <ConfigToggle label="Slack Notifications" defaultChecked={false} hint="Send alerts to Slack webhook" />
              </div>
            </ChartCard>
          )}

          {activeSection === "security" && (
            <ChartCard title="Security & Authentication" icon="🔒">
              <div className="space-y-5">
                <ConfigSelect
                  label="Authentication Mode"
                  options={["api-key", "bearer-token", "oauth2"]}
                  defaultValue="api-key"
                  hint="How clients authenticate with the gateway"
                />
                <ConfigToggle label="Rate Limiting" defaultChecked hint="Enforce per-client request rate limits" />
                <ConfigField label="Rate Limit (req/min)" defaultValue="60" hint="Maximum requests per minute per client" />
                <ConfigToggle label="IP Allowlist" defaultChecked={false} hint="Restrict access to specific IP addresses" />
                <ConfigField label="API Key Rotation (days)" defaultValue="90" hint="Recommended rotation period for API keys" />
              </div>
            </ChartCard>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Form components ──────────────────────────────────────────────────

function ConfigField({ label, defaultValue, hint }: { label: string; defaultValue: string; hint: string }) {
  const [value, setValue] = useState(defaultValue);
  return (
    <div>
      <label className="block text-xs font-medium text-text mb-1.5">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-full max-w-xs px-3 py-2 text-sm bg-bg border border-border rounded-xl text-text font-mono placeholder:text-text-dim focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
      />
      <p className="text-[10px] text-text-dim mt-1">{hint}</p>
    </div>
  );
}

function ConfigToggle({ label, defaultChecked = true, hint }: { label: string; defaultChecked?: boolean; hint: string }) {
  const [checked, setChecked] = useState(defaultChecked);
  return (
    <div>
      <div className="flex items-center gap-3">
        <button
          onClick={() => setChecked(!checked)}
          className={`relative w-10 h-5 rounded-full transition-colors duration-200 ${
            checked ? "bg-primary" : "bg-surface-light"
          }`}
        >
          <span
            className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${
              checked ? "translate-x-5" : "translate-x-0.5"
            }`}
          />
        </button>
        <span className="text-xs font-medium text-text">{label}</span>
      </div>
      <p className="text-[10px] text-text-dim mt-1 ml-13">{hint}</p>
    </div>
  );
}

function ConfigSelect({ label, options, defaultValue, hint }: { label: string; options: string[]; defaultValue: string; hint: string }) {
  const [value, setValue] = useState(defaultValue);
  return (
    <div>
      <label className="block text-xs font-medium text-text mb-1.5">{label}</label>
      <select
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-full max-w-xs px-3 py-2 text-sm bg-bg border border-border rounded-xl text-text font-mono focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all appearance-none cursor-pointer"
      >
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
      <p className="text-[10px] text-text-dim mt-1">{hint}</p>
    </div>
  );
}

function ConfigMultiSelect({ label, options, defaults, hint }: { label: string; options: string[]; defaults: string[]; hint: string }) {
  const [selected, setSelected] = useState<string[]>(defaults);
  const toggle = (o: string) => {
    setSelected((prev) => (prev.includes(o) ? prev.filter((x) => x !== o) : [...prev, o]));
  };
  return (
    <div>
      <label className="block text-xs font-medium text-text mb-1.5">{label}</label>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o}
            onClick={() => toggle(o)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              selected.includes(o)
                ? "bg-danger/15 border-danger/30 text-danger"
                : "bg-surface border-border text-text-muted hover:text-text"
            }`}
          >
            {o}
          </button>
        ))}
      </div>
      <p className="text-[10px] text-text-dim mt-1">{hint}</p>
    </div>
  );
}
