# Creator Empire Simulator — Phase 0 Research Snapshot

**Verified:** 2026-08-06  
**Scope:** Creator monetization, originality, AI disclosure, CapCut credits, and product implications.

## Product-level decisions

1. The app must store policy rules as editable records with `sourceUrl`, `lastVerifiedAt`, `country`, `status`, and `notes` rather than hard-coded constants.
2. YouTube monetization progress must separate early YPP access from advertising-revenue eligibility.
3. “AI-generated” is not itself a monetization decision. The app should evaluate originality, narrative value, rights, realistic synthetic disclosure, and channel-level repetition risk separately.
4. Facebook monetization must be modeled as account/region eligibility with an invitation or dashboard-status field, not a universal threshold.
5. TikTok monetization must be country-aware. For Thailand, TikTok Shop/Affiliate is a practical monetization route, while Creator Rewards availability must remain an editable region capability.
6. CapCut estimates must be learned from the user’s own ledger. The UI should capture balance before/after, model, duration, resolution, generation count, regeneration count, and whether the output was usable.

## Official-source snapshot

### YouTube Partner Program

- Early monetization features may become available at 500 subscribers, 3 public uploads in 90 days, and either 3,000 valid public watch hours in 365 days or 3 million valid public Shorts views in 90 days.
- Advertising revenue requires 1,000 subscribers and either 4,000 valid public watch hours in 365 days or 10 million valid public Shorts views in 90 days.
- Shorts Feed watch time does not count toward the 4,000-hour long-form threshold.

Sources:
- https://support.google.com/youtube/answer/72857
- https://support.google.com/adsense/answer/72851

### YouTube altered or synthetic content

YouTube requires disclosure when content is meaningfully altered or synthetically generated and appears realistic, including a realistic scene that did not occur. Disclosure itself does not limit audience reach or monetization eligibility. Persistent failure to disclose may lead to labels, content action, or YPP penalties.

Source:
- https://support.google.com/youtube/answer/14328491

### YouTube originality / inauthentic-content risk

The product should flag mass-produced, template-like, minimally differentiated, or low-narrative output. Risk is assessed at channel level, not only video level. The system should preserve evidence of original research, scripts, editing decisions, sources, and project history.

Source:
- https://support.google.com/youtube/answer/1311392

### Facebook Content Monetization

Meta’s 2026 public update states that Facebook Content Monetization pays across eligible Reels, long-form video, Stories, photo, and text posts. It remains invite-only; creators may express interest through Professional Dashboard. Meta is emphasizing original content, deeper engagement, longer watch time, and qualified views.

Sources:
- https://about.fb.com/news/2026/03/creator-fast-track-grow-your-audience-earn-money-on-facebook/
- https://about.fb.com/news/2026/03/rewarding-original-creators-on-facebook/

### TikTok

TikTok states that Creator Rewards qualifying videos must be original, high-quality, and longer than one minute, and the program is only available in valid regions. Thailand-specific TikTok Shop documentation states creator access requirements including more than 1,000 followers, age 18+, and being in Thailand; this route should be modeled separately from Creator Rewards.

Sources:
- https://support.tiktok.com/en/business-and-creator/creator-rewards-program/how-is-the-creator-rewards-program-different-from-the-tiktok-creator-fund
- https://seller-th.tiktok.com/university/essay?knowledge_id=2224597307737872&lang=en

### CapCut credits

CapCut credits are deducted when a user confirms an eligible AI operation. CapCut’s help center currently states that one credit is equivalent to USD 0.01, but model/action pricing may vary. The application must not use a fixed “credits per video” constant.

Sources:
- https://www.capcut.com/help/credits-in-capcut
- https://www.capcut.com/help/how-to-use-credits

## Data fields required for the policy registry

```ts
interface PolicyRule {
  id: string;
  platform: 'youtube' | 'facebook' | 'tiktok' | 'instagram' | 'capcut' | 'other';
  country: string | 'global';
  topic: string;
  summary: string;
  sourceUrl: string;
  lastVerifiedAt: string;
  status: 'active' | 'uncertain' | 'deprecated';
  editableValue?: string | number | boolean;
  notes?: string;
}
```

## Research limitations

- Platform eligibility may differ by account, country, age, content type, and invitation status.
- Monetization payment rates are not stable constants and should not be presented as guaranteed values.
- The Phase 0 snapshot is a product-policy baseline, not legal, tax, or financial advice.
