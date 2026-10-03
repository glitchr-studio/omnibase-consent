<?php

namespace Base\Consent;

use Base\Bundle\AbstractBaseBundle;
use Base\Traits\SingletonTrait;

/**
 * The cookie answer shared by the omnibase sites: a Twig partial
 * (@Consent/_cookie.html.twig), its script and its stylesheet
 * (bundles/consent/), and the `consent:` configuration.
 */
class ConsentBundle extends AbstractBaseBundle
{
    use SingletonTrait;

    public function __construct()
    {
        parent::__construct();
    }

    /** Modern layout: the class lives in src/, the bundle root is the package root. */
    public function getPath(): string
    {
        return \dirname(__DIR__);
    }
}
