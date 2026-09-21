# Changelog

## [1.2.0](https://github.com/musher-dev/specifications/compare/blueprint/v1.1.0...blueprint/v1.2.0) (2026-09-21)


### Additions

* **blueprint:** defer the node obligation to publication ([c1bb2d6](https://github.com/musher-dev/specifications/commit/c1bb2d6449436f596c21e55522a94f8755a36c2f))

## [1.1.0](https://github.com/musher-dev/specifications/compare/blueprint/v1.0.0...blueprint/v1.1.0) (2026-09-20)


### Additions

* **blueprint:** defer the description obligation to publication ([965b046](https://github.com/musher-dev/specifications/commit/965b046126d7440e45e6e8ab0b3789a6655f6015))
* **component:** defer the description obligation to publication, and enforce COMP-OUT-003 ([965b046](https://github.com/musher-dev/specifications/commit/965b046126d7440e45e6e8ab0b3789a6655f6015))


### Specification prose

* **repo:** record how a released family is corrected within its major ([965b046](https://github.com/musher-dev/specifications/commit/965b046126d7440e45e6e8ab0b3789a6655f6015))

## 1.0.0 (2026-09-18)


### ⚠ BREAKING CHANGES

* **core:** one grammar for component and blueprint documents (ADR 0031) ([#101](https://github.com/musher-dev/specifications/issues/101))
* **core:** complete v1 release and atomic connection contracts ([#97](https://github.com/musher-dev/specifications/issues/97))
* **core:** Replace the unreleased draft binding and value syntax before the first formal family releases, as recorded in ADR 0028.
* **component:** `suppliedBy`, `ui`, `generator` and `platformDefault` are removed from a component input; `description` is required on every component input and output; a blueprint parameter loses `schema`, `required` and `description` and requires `ui`; install-form parameters are always authored, so derivation and the merge are removed; `ERR_INPUT_NOT_REFERENCEABLE`, `ERR_UNWIRED_REQUIRED_INPUT`, `ERR_UNCOVERED_REQUIRED_INPUT`, `ERR_INCOMPATIBLE_PARAMETER_TYPE` and `ERR_INCOMPATIBLE_PARAMETER_RESOURCE_TYPE` are withdrawn, `ERR_INPUT_NOT_CONNECTABLE` and `ERR_CONFLICTING_INPUT_SCHEMA` change meaning, and `ERR_UNSATISFIED_REQUIRED_INPUT` and `ERR_GENERATED_INPUT_NOT_SENSITIVE` are added. Free of a new major directory under ADR 0005 section 1: no family has been tagged.
* **component:** every rename above rejects a document that spells the old name, and the seven new identifier grammars reject names that validated before. ADR 0005 §1's pre-publication window applies: no `v<N>` directory and no migration note, since `git tag -l` is empty and `published.json` records no release. Maintainer approval is the obligation the window does not remove.
* **component:** `platformDefault.type` is REQUIRED and names the kind of default, with one member `SELF_ADDRESS`; a `CONNECTION` input MUST NOT carry a `platformDefault` or a `generator`; and a `generator` MUST NOT sit beside a `platformDefault`. The tag is added now because introducing a discriminator later is introducing a required field later, and the exclusions close a gap §6.1 recorded rather than decided. ADR 0005 §1's pre-publication window applies: no `v<N>` directory and no migration note, since no version has been tagged.
* `INTEGER` is withdrawn from `schema.type`; use `NUMBER`, with `pattern: '^-?[0-9]+$'` where whole numbers are required. `format` MUST now be null where `type` is not `STRING`. ADR 0005 §1's pre-publication window applies: no `v<N>` directory and no migration note, since no version has been tagged.
* a SERVICE declaring no endpoints, or an empty endpoints mapping, is now rejected. No new v<N> directory: no family has been published, git tag -l is empty and the release-please manifest reads 0.0.0, so §3's compatibility guarantee has no released version to run from. ADR 0005 §1 sets out that window and §4 records this decision. The window closes on the first tag.

### Additions

* **blueprint:** specify how an authored parameter binds to component inputs ([#36](https://github.com/musher-dev/specifications/issues/36)) ([311be77](https://github.com/musher-dev/specifications/commit/311be778852b0ecf0ae08af71b601dd005e91e14))
* **blueprint:** specify node compute — the size grammar, the Compute Profile catalog, and the advanced pins ([#35](https://github.com/musher-dev/specifications/issues/35)) ([0a6e4b2](https://github.com/musher-dev/specifications/commit/0a6e4b24101f191ba28c169c33307f5df967e998))
* bootstrap the canonical Musher specification repository ([e3b8ea5](https://github.com/musher-dev/specifications/commit/e3b8ea5e574ef63d54ec75c7c8527301401f01e7))
* close the endpoint, environment-variable, and graph-rule specification gaps ([#31](https://github.com/musher-dev/specifications/issues/31)) ([3b7110c](https://github.com/musher-dev/specifications/commit/3b7110c606a1ad9b685c3e30e63f5812767a3882))
* **component:** a component declares requirements, and the blueprint supplies them ([#94](https://github.com/musher-dev/specifications/issues/94)) ([fc025fb](https://github.com/musher-dev/specifications/commit/fc025fb50f3059f1c3320e7264b4f9880c04e5b2))
* **component:** a node this platform does not run — ADR 0019, on ADR 0007 and ADR 0009 ([#80](https://github.com/musher-dev/specifications/issues/80)) ([e69f1ed](https://github.com/musher-dev/specifications/commit/e69f1edcf862c3dd503d8e94c45ec8706f020b31))
* **component:** let the install form say what control it asks for ([#79](https://github.com/musher-dev/specifications/issues/79)) ([7b79284](https://github.com/musher-dev/specifications/commit/7b79284156b6cd6514e8391ed2ba2c524438b0c3))
* **component:** several values from a named set — STRING_LIST, ADR 0020 ([#85](https://github.com/musher-dev/specifications/issues/85)) ([f27e2a9](https://github.com/musher-dev/specifications/commit/f27e2a977c53e73f5ef8f6f01ade3167e3476fdc))
* **core:** add the Musher Document Core Specification ([3a9ab6e](https://github.com/musher-dev/specifications/commit/3a9ab6e23a44bc6440791d12bef36b5e6cc587eb))
* **core:** complete v1 release and atomic connection contracts ([#97](https://github.com/musher-dev/specifications/issues/97)) ([ac9047a](https://github.com/musher-dev/specifications/commit/ac9047a2ad65675b7611fa14df248e87875593bd))
* **core:** establish explicit pre-release binding and resolution ([#96](https://github.com/musher-dev/specifications/issues/96)) ([900d0f7](https://github.com/musher-dev/specifications/commit/900d0f729dd8007db539413fffd6496d0ee14c21))
* **core:** one grammar for component and blueprint documents (ADR 0031) ([#101](https://github.com/musher-dev/specifications/issues/101)) ([c3a94fb](https://github.com/musher-dev/specifications/commit/c3a94fbed1871d60046076ffe0b2014ef20a1163))
* fill the spec.md TODOs from implemented behaviour, and settle cycle detection ([#13](https://github.com/musher-dev/specifications/issues/13)) ([be77e19](https://github.com/musher-dev/specifications/commit/be77e192233e3c15ea524a7485f4af5228cfb332))
* reconcile the specification/platform divergences, and expose the edge address ([#41](https://github.com/musher-dev/specifications/issues/41)) ([af2dec0](https://github.com/musher-dev/specifications/commit/af2dec0cde046a3307fb7154c918bbf57c42c5f2))
* reconcile the value-shape vocabulary — STRING, NUMBER, BOOLEAN, JSON ([#57](https://github.com/musher-dev/specifications/issues/57)) ([fbab4ba](https://github.com/musher-dev/specifications/commit/fbab4bac0e856899e1fd540f21e4c8180d6a4485))
* **repo:** publish a generated field reference at schemas.musher.dev/reference ([#77](https://github.com/musher-dev/specifications/issues/77)) ([8ff7c2a](https://github.com/musher-dev/specifications/commit/8ff7c2ae7ed41b9404fb7975206dd60199e24ac7))
* **repo:** rebuild exact-version schemas from tags, and harden the specification for 1.0.0 ([#42](https://github.com/musher-dev/specifications/issues/42)) ([e840e6d](https://github.com/musher-dev/specifications/commit/e840e6dab459ffaa2cfcf977b04f79c7a02734e9))


### Corrections

* **blueprint:** stop §10 rejecting a cycle §4.2 permits ([#48](https://github.com/musher-dev/specifications/issues/48)) ([234a173](https://github.com/musher-dev/specifications/commit/234a1736146c28c8dfa0142bc67b3796f4663baf))
* **blueprint:** suppress ERR_UNBOUND_PARAMETER where a node's component is unreadable ([#40](https://github.com/musher-dev/specifications/issues/40)) ([a40b3a9](https://github.com/musher-dev/specifications/commit/a40b3a997d2b334b5fd0e371919b4499e818fea7))
* enforce the §2 unknown-property rule below the envelope ([#10](https://github.com/musher-dev/specifications/issues/10)) ([cdc3cc4](https://github.com/musher-dev/specifications/commit/cdc3cc42d08e0144beaa91145dd5645263218fc5))
* **tools:** let git read a repository another user owns ([4532194](https://github.com/musher-dev/specifications/commit/45321941a3b586247cefa02ea720ce47460e6bec))


### Specification prose

* **blueprint:** say a published componentRef names the component, not a revision ([#92](https://github.com/musher-dev/specifications/issues/92)) ([f392426](https://github.com/musher-dev/specifications/commit/f392426a9ab50cb7df146cc9f3f59ea0a55b67c9)), closes [#86](https://github.com/musher-dev/specifications/issues/86)
* **component:** specify the behaviour when a document uses a field from a newer schema release ([#26](https://github.com/musher-dev/specifications/issues/26)) ([0ce4997](https://github.com/musher-dev/specifications/commit/0ce4997f968549170adc7c288819d390421ed96f))
* **repo:** ADR 0024 the repository root holds only what must be there ([4532194](https://github.com/musher-dev/specifications/commit/45321941a3b586247cefa02ea720ce47460e6bec))
* **repo:** mark the v1 specifications stable ([#102](https://github.com/musher-dev/specifications/issues/102)) ([2ab0b27](https://github.com/musher-dev/specifications/commit/2ab0b27ce0d9b7673b609e202bbabb27da4fe1f4))
