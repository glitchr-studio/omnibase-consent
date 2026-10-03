<?php

namespace Base\Consent\DependencyInjection;

use Base\Bundle\AbstractBaseExtension;
use Symfony\Component\Config\Definition\Processor;
use Symfony\Component\Config\FileLocator;
use Symfony\Component\DependencyInjection\ContainerBuilder;
use Symfony\Component\DependencyInjection\Loader\PhpFileLoader;

class ConsentExtension extends AbstractBaseExtension
{
    public function getConfiguration(array $config, ContainerBuilder $container): ConsentConfiguration
    {
        return new ConsentConfiguration();
    }

    public function load(array $configs, ContainerBuilder $container): void
    {
        $loader = new PhpFileLoader($container, new FileLocator(\dirname(__DIR__, 2).'/config'));
        $loader->load('services.php');

        $configuration = new ConsentConfiguration();
        $config = (new Processor())->processConfiguration($configuration, $configs);

        // Flat parameters (consent.groups, consent.countdown...), and the whole tree for the Twig extension.
        $this->setConfiguration($container, $config, $configuration->getTreeBuilder()->buildTree()->getName());
        $container->setParameter('consent.config', $config);
    }
}
