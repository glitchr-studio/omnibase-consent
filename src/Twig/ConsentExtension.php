<?php

namespace Base\Consent\Twig;

use Base\Routing\AdvancedRouterInterface;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\Translation\MessageCatalogueInterface;
use Symfony\Component\Translation\TranslatorBagInterface;
use Symfony\Contracts\Translation\TranslatorInterface;
use Twig\Extension\AbstractExtension;
use Twig\TwigFunction;

/**
 * consent_options(): what the partial hands its script - the features and
 * their switches, the countdown - and the privacy page's URL.
 */
class ConsentExtension extends AbstractExtension
{
    public function __construct(
        #[Autowire('%consent.config%')] private readonly array $config,
        // omnibase's router: the URL in the visitor's language (/datenschutz, not /confidentialite).
        private readonly AdvancedRouterInterface $urls,
        private readonly TranslatorInterface $translator,
    ) {
    }

    public function getFunctions(): array
    {
        return [new TwigFunction('consent_options', $this->options(...))];
    }

    /**
     * @return array{groups: list<string>, features: list<array{name: string, label: string, description: ?string, implicit: bool, required: bool, erase: list<string>}>, countdown: int, erase: list<string>, privacy: ?string}
     */
    public function options(): array
    {
        $features = [];
        // The site's own groups first: on by default, and on without an answer.
        foreach ($this->config['groups'] ?: ['USER'] as $group) {
            $features[strtoupper($group)] = ['implicit' => true, 'required' => false, 'erase' => []];
        }
        foreach ($this->config['features'] ?? [] as $name => $feature) {
            $features[strtoupper($name)] = $feature + ['implicit' => false, 'required' => false, 'erase' => []];
        }

        $list = [];
        foreach ($features as $name => $feature) {
            $list[] = [
                'name' => $name,
                'label' => $this->text($name, 'label') ?? ucfirst(strtolower($name)),
                'description' => $this->text($name, 'description'),
                'implicit' => (bool) $feature['implicit'],
                'required' => (bool) $feature['required'],
                'erase' => array_values($feature['erase']),
            ];
        }

        // The names the translations know (consent.features.<name>.*): a
        // script that declares one of them later gets its words.
        $labels = [];
        foreach ($this->knownNames() as $name) {
            if ($label = $this->text($name, 'label')) {
                $labels[strtoupper($name)] = ['label' => $label, 'description' => $this->text($name, 'description')];
            }
        }

        return [
            'labels' => $labels,
            'groups' => array_keys($features),
            'features' => $list,
            'countdown' => (int) $this->config['countdown'],
            'erase' => array_values($this->config['erase_on_refuse']),
            'privacy' => $this->privacy(),
        ];
    }

    /** @return list<string> the feature names under consent.features.* in the current catalogue (bundle's and site's) */
    private function knownNames(): array
    {
        if (!$this->translator instanceof TranslatorBagInterface) {
            return [];
        }
        $names = [];
        for ($catalogue = $this->translator->getCatalogue(); $catalogue; $catalogue = $catalogue->getFallbackCatalogue()) {
            foreach (['consent', 'consent'.MessageCatalogueInterface::INTL_DOMAIN_SUFFIX] as $domain) {
                foreach (array_keys($catalogue->all($domain)) as $key) {
                    if (preg_match('/^features\.([^.]+)\.label$/', $key, $match)) {
                        $names[$match[1]] = true;
                    }
                }
            }
        }

        return array_keys($names);
    }

    /** consent.features.<name>.<field>, null when neither the bundle nor the site says it. */
    private function text(string $name, string $field): ?string
    {
        $key = 'features.'.strtolower($name).'.'.$field;
        $text = $this->translator->trans($key, [], 'consent');

        return $text === $key || $text === '' ? null : $text;
    }

    private function privacy(): ?string
    {
        $route = $this->config['privacy_route'] ?? null;
        if (!$route) {
            return null;
        }

        try {
            return $this->urls->generate($route, $this->config['privacy_route_parameters'] ?? []);
        } catch (\Throwable) {
            // No such page on this site: the panel goes without the link.
            return null;
        }
    }
}
