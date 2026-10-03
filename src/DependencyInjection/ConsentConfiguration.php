<?php

namespace Base\Consent\DependencyInjection;

use Base\Bundle\AbstractBaseConfiguration;
use Symfony\Component\Config\Definition\Builder\TreeBuilder;

class ConsentConfiguration extends AbstractBaseConfiguration
{
    private bool $childrenDeclared = false;

    public function getConfigTreeBuilder(): TreeBuilder
    {
        $treeBuilder = $this->getTreeBuilder();
        if ($this->childrenDeclared) {
            return $treeBuilder;
        }
        $this->childrenDeclared = true;

        $treeBuilder->getRootNode()
            ->children()
                ->arrayNode('groups')
                    ->info('The site\'s own @glitchr/cookie groups (omnibase writes USER/*): on by default, on when the visitor does not answer. Shorthand for features with implicit: true.')
                    ->scalarPrototype()->end()
                    ->defaultValue(['USER'])
                ->end()
                ->integerNode('countdown')->min(0)->defaultValue(10)
                    ->info('Seconds before a visitor who has not answered counts as accepting (counted down in the panel). 0: no implicit acceptance, the panel waits for an answer.')->end()
                ->scalarNode('privacy_route')->defaultValue('app_privacy')
                    ->info('The route of the privacy page linked from the panel; null, or a route that does not exist, leaves the link out.')->end()
                ->arrayNode('features')
                    ->info('The features that keep cookies, by @glitchr/cookie group (CHAT, ANALYTICS, SOCIAL...), each with its own switch in the panel. Scripts may also declare theirs at run time (window.Consent.use()). Labels: translations consent.features.<name>.label / .description.')
                    ->useAttributeAsKey('name')
                    ->arrayPrototype()
                        ->children()
                            ->booleanNode('implicit')->defaultFalse()->info('On when the visitor does not answer (the countdown). Keep it for what the site needs to work; a tracker must wait for a yes.')->end()
                            ->booleanNode('required')->defaultFalse()->info('Always on, its switch locked: the session, a basket.')->end()
                            ->arrayNode('erase')->info('Name prefixes of its cookies set by a third party, deleted when it is turned off (e.g. crisp-client).')->scalarPrototype()->end()->defaultValue([])->end()
                        ->end()
                    ->end()
                    ->defaultValue([])
                ->end()
                ->arrayNode('privacy_route_parameters')
                    ->info('Parameters of privacy_route, e.g. {slug: vie-privee} for a page served by a generic route.')
                    ->useAttributeAsKey('name')->scalarPrototype()->end()
                    ->defaultValue([])
                ->end()
                ->arrayNode('erase_on_refuse')
                    ->info('Name prefixes of cookies also deleted on a refusal, e.g. a chat\'s ("crisp-client"). The groups\' own cookies always are.')
                    ->scalarPrototype()->end()
                    ->defaultValue([])
                ->end()
            ->end()
        ->end();

        return $treeBuilder;
    }
}
