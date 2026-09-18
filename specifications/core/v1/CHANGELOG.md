# Changelog

## [2.0.0](https://github.com/musher-dev/specifications/compare/core/v1.0.0...core/v2.0.0) (2026-09-18)


### ⚠ BREAKING CHANGES

* **core:** one grammar for component and blueprint documents (ADR 0031) ([#101](https://github.com/musher-dev/specifications/issues/101))
* **core:** complete v1 release and atomic connection contracts ([#97](https://github.com/musher-dev/specifications/issues/97))
* **core:** Replace the unreleased draft binding and value syntax before the first formal family releases, as recorded in ADR 0028.
* **component:** `suppliedBy`, `ui`, `generator` and `platformDefault` are removed from a component input; `description` is required on every component input and output; a blueprint parameter loses `schema`, `required` and `description` and requires `ui`; install-form parameters are always authored, so derivation and the merge are removed; `ERR_INPUT_NOT_REFERENCEABLE`, `ERR_UNWIRED_REQUIRED_INPUT`, `ERR_UNCOVERED_REQUIRED_INPUT`, `ERR_INCOMPATIBLE_PARAMETER_TYPE` and `ERR_INCOMPATIBLE_PARAMETER_RESOURCE_TYPE` are withdrawn, `ERR_INPUT_NOT_CONNECTABLE` and `ERR_CONFLICTING_INPUT_SCHEMA` change meaning, and `ERR_UNSATISFIED_REQUIRED_INPUT` and `ERR_GENERATED_INPUT_NOT_SENSITIVE` are added. Free of a new major directory under ADR 0005 section 1: no family has been tagged.

### Additions

* **component:** a component declares requirements, and the blueprint supplies them ([#94](https://github.com/musher-dev/specifications/issues/94)) ([fc025fb](https://github.com/musher-dev/specifications/commit/fc025fb50f3059f1c3320e7264b4f9880c04e5b2))
* **core:** add the Musher Document Core Specification ([3a9ab6e](https://github.com/musher-dev/specifications/commit/3a9ab6e23a44bc6440791d12bef36b5e6cc587eb))
* **core:** complete v1 release and atomic connection contracts ([#97](https://github.com/musher-dev/specifications/issues/97)) ([ac9047a](https://github.com/musher-dev/specifications/commit/ac9047a2ad65675b7611fa14df248e87875593bd))
* **core:** establish explicit pre-release binding and resolution ([#96](https://github.com/musher-dev/specifications/issues/96)) ([900d0f7](https://github.com/musher-dev/specifications/commit/900d0f729dd8007db539413fffd6496d0ee14c21))
* **core:** one grammar for component and blueprint documents (ADR 0031) ([#101](https://github.com/musher-dev/specifications/issues/101)) ([c3a94fb](https://github.com/musher-dev/specifications/commit/c3a94fbed1871d60046076ffe0b2014ef20a1163))


### Corrections

* **tools:** let git read a repository another user owns ([4532194](https://github.com/musher-dev/specifications/commit/45321941a3b586247cefa02ea720ce47460e6bec))


### Specification prose

* **repo:** ADR 0024 the repository root holds only what must be there ([4532194](https://github.com/musher-dev/specifications/commit/45321941a3b586247cefa02ea720ce47460e6bec))
* **repo:** mark the v1 specifications stable ([#102](https://github.com/musher-dev/specifications/issues/102)) ([2ab0b27](https://github.com/musher-dev/specifications/commit/2ab0b27ce0d9b7673b609e202bbabb27da4fe1f4))

## 1.0.0 (2026-09-18)


### ⚠ BREAKING CHANGES

* **core:** one grammar for component and blueprint documents (ADR 0031) ([#101](https://github.com/musher-dev/specifications/issues/101))
* **core:** complete v1 release and atomic connection contracts ([#97](https://github.com/musher-dev/specifications/issues/97))
* **core:** Replace the unreleased draft binding and value syntax before the first formal family releases, as recorded in ADR 0028.
* **component:** `suppliedBy`, `ui`, `generator` and `platformDefault` are removed from a component input; `description` is required on every component input and output; a blueprint parameter loses `schema`, `required` and `description` and requires `ui`; install-form parameters are always authored, so derivation and the merge are removed; `ERR_INPUT_NOT_REFERENCEABLE`, `ERR_UNWIRED_REQUIRED_INPUT`, `ERR_UNCOVERED_REQUIRED_INPUT`, `ERR_INCOMPATIBLE_PARAMETER_TYPE` and `ERR_INCOMPATIBLE_PARAMETER_RESOURCE_TYPE` are withdrawn, `ERR_INPUT_NOT_CONNECTABLE` and `ERR_CONFLICTING_INPUT_SCHEMA` change meaning, and `ERR_UNSATISFIED_REQUIRED_INPUT` and `ERR_GENERATED_INPUT_NOT_SENSITIVE` are added. Free of a new major directory under ADR 0005 section 1: no family has been tagged.

### Additions

* **component:** a component declares requirements, and the blueprint supplies them ([#94](https://github.com/musher-dev/specifications/issues/94)) ([fc025fb](https://github.com/musher-dev/specifications/commit/fc025fb50f3059f1c3320e7264b4f9880c04e5b2))
* **core:** add the Musher Document Core Specification ([3a9ab6e](https://github.com/musher-dev/specifications/commit/3a9ab6e23a44bc6440791d12bef36b5e6cc587eb))
* **core:** complete v1 release and atomic connection contracts ([#97](https://github.com/musher-dev/specifications/issues/97)) ([ac9047a](https://github.com/musher-dev/specifications/commit/ac9047a2ad65675b7611fa14df248e87875593bd))
* **core:** establish explicit pre-release binding and resolution ([#96](https://github.com/musher-dev/specifications/issues/96)) ([900d0f7](https://github.com/musher-dev/specifications/commit/900d0f729dd8007db539413fffd6496d0ee14c21))
* **core:** one grammar for component and blueprint documents (ADR 0031) ([#101](https://github.com/musher-dev/specifications/issues/101)) ([c3a94fb](https://github.com/musher-dev/specifications/commit/c3a94fbed1871d60046076ffe0b2014ef20a1163))


### Corrections

* **tools:** let git read a repository another user owns ([4532194](https://github.com/musher-dev/specifications/commit/45321941a3b586247cefa02ea720ce47460e6bec))


### Specification prose

* **repo:** ADR 0024 the repository root holds only what must be there ([4532194](https://github.com/musher-dev/specifications/commit/45321941a3b586247cefa02ea720ce47460e6bec))
* **repo:** mark the v1 specifications stable ([#102](https://github.com/musher-dev/specifications/issues/102)) ([2ab0b27](https://github.com/musher-dev/specifications/commit/2ab0b27ce0d9b7673b609e202bbabb27da4fe1f4))
