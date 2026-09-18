# Changelog

## 1.0.0 (2026-09-18)


### ⚠ BREAKING CHANGES

* **core:** one grammar for component and blueprint documents (ADR 0031) ([#101](https://github.com/musher-dev/specifications/issues/101))
* **core:** complete v1 release and atomic connection contracts ([#97](https://github.com/musher-dev/specifications/issues/97))
* **core:** Replace the unreleased draft binding and value syntax before the first formal family releases, as recorded in ADR 0028.
* **component:** every rename above rejects a document that spells the old name, and the seven new identifier grammars reject names that validated before. ADR 0005 §1's pre-publication window applies: no `v<N>` directory and no migration note, since `git tag -l` is empty and `published.json` records no release. Maintainer approval is the obligation the window does not remove.

### Additions

* bootstrap the canonical Musher specification repository ([e3b8ea5](https://github.com/musher-dev/specifications/commit/e3b8ea5e574ef63d54ec75c7c8527301401f01e7))
* **component:** a node this platform does not run — ADR 0019, on ADR 0007 and ADR 0009 ([#80](https://github.com/musher-dev/specifications/issues/80)) ([e69f1ed](https://github.com/musher-dev/specifications/commit/e69f1edcf862c3dd503d8e94c45ec8706f020b31))
* **core:** add the Musher Document Core Specification ([3a9ab6e](https://github.com/musher-dev/specifications/commit/3a9ab6e23a44bc6440791d12bef36b5e6cc587eb))
* **core:** complete v1 release and atomic connection contracts ([#97](https://github.com/musher-dev/specifications/issues/97)) ([ac9047a](https://github.com/musher-dev/specifications/commit/ac9047a2ad65675b7611fa14df248e87875593bd))
* **core:** establish explicit pre-release binding and resolution ([#96](https://github.com/musher-dev/specifications/issues/96)) ([900d0f7](https://github.com/musher-dev/specifications/commit/900d0f729dd8007db539413fffd6496d0ee14c21))
* **core:** one grammar for component and blueprint documents (ADR 0031) ([#101](https://github.com/musher-dev/specifications/issues/101)) ([c3a94fb](https://github.com/musher-dev/specifications/commit/c3a94fbed1871d60046076ffe0b2014ef20a1163))
* execute the semantic phase, and close the conformance debt behind issue [#9](https://github.com/musher-dev/specifications/issues/9) ([#25](https://github.com/musher-dev/specifications/issues/25)) ([5be1e0a](https://github.com/musher-dev/specifications/commit/5be1e0a903d918cef049fc873538fd31773211e4))
* fill the spec.md TODOs from implemented behaviour, and settle cycle detection ([#13](https://github.com/musher-dev/specifications/issues/13)) ([be77e19](https://github.com/musher-dev/specifications/commit/be77e192233e3c15ea524a7485f4af5228cfb332))
* **listing:** add AGENTS to the category taxonomy ([#76](https://github.com/musher-dev/specifications/issues/76)) ([9ba2147](https://github.com/musher-dev/specifications/commit/9ba214782b1f0701642d5268590cc153bd35a362))
* **listing:** constrain the description Markdown subset, and state the vocabulary governance rule ([#39](https://github.com/musher-dev/specifications/issues/39)) ([cf129c4](https://github.com/musher-dev/specifications/commit/cf129c45b0b501ea1c8a6b9b764b30e35d268ca2))
* **listing:** define how a description image resolves after ingest ([#47](https://github.com/musher-dev/specifications/issues/47)) ([9c8238a](https://github.com/musher-dev/specifications/commit/9c8238a3a331df24e1b88418180c9c6fd19fede5))
* **listing:** define what metadata.version agrees with in a COMPONENT item ([#37](https://github.com/musher-dev/specifications/issues/37)) ([3031344](https://github.com/musher-dev/specifications/commit/303134490aadb6d5feb2079b3beae1e97a179d60)), closes [#21](https://github.com/musher-dev/specifications/issues/21)
* **repo:** rebuild exact-version schemas from tags, and harden the specification for 1.0.0 ([#42](https://github.com/musher-dev/specifications/issues/42)) ([e840e6d](https://github.com/musher-dev/specifications/commit/e840e6dab459ffaa2cfcf977b04f79c7a02734e9))


### Corrections

* **listing:** case-fold the scalar URL scheme pattern so §4.1's two placements agree ([#45](https://github.com/musher-dev/specifications/issues/45)) ([e5a3f85](https://github.com/musher-dev/specifications/commit/e5a3f85d0f500842185c0ccbcf60d6e8fd923907)), closes [#43](https://github.com/musher-dev/specifications/issues/43)
* **tools:** let git read a repository another user owns ([4532194](https://github.com/musher-dev/specifications/commit/45321941a3b586247cefa02ea720ce47460e6bec))


### Specification prose

* **component:** specify the behaviour when a document uses a field from a newer schema release ([#26](https://github.com/musher-dev/specifications/issues/26)) ([0ce4997](https://github.com/musher-dev/specifications/commit/0ce4997f968549170adc7c288819d390421ed96f))
* **repo:** ADR 0024 the repository root holds only what must be there ([4532194](https://github.com/musher-dev/specifications/commit/45321941a3b586247cefa02ea720ce47460e6bec))
* **repo:** mark the v1 specifications stable ([#102](https://github.com/musher-dev/specifications/issues/102)) ([2ab0b27](https://github.com/musher-dev/specifications/commit/2ab0b27ce0d9b7673b609e202bbabb27da4fe1f4))
