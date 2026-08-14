# Security Policy

Security is an important part of the development of **Ranu.js**.

Ranu.js is currently in pre-alpha development. APIs, internal architecture, and security boundaries may continue to evolve as the framework progresses toward its first stable release.

## Supported Versions

Security fixes are currently applied to the latest development version of Ranu.js.

| Version                              | Supported |
| ------------------------------------ | --------- |
| Latest pre-alpha development version | ✅         |

Once Ranu.js begins publishing versioned releases, this section will be updated to document the security support policy for individual release lines.

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

If you believe you have discovered a security vulnerability in Ranu.js, please report it privately through **GitHub Private Vulnerability Reporting**.

### GitHub Private Vulnerability Reporting

1. Open the Ranu.js repository on GitHub.
2. Go to the **Security** tab.
3. Select **Report a vulnerability**.
4. Provide the relevant details and submit the report privately to the maintainers.

Repository:

`https://github.com/hoslift/ranu.js`

If the **Report a vulnerability** option is not available, please avoid publishing vulnerability details through GitHub Issues or Discussions while an appropriate private reporting channel is being established.

## What to Include

To help us investigate efficiently, please include as much relevant information as possible:

* A clear description of the vulnerability
* The affected component or package
* Steps required to reproduce the issue
* A minimal proof-of-concept, where appropriate
* The affected Ranu.js version, commit, or development revision
* The potential security impact
* Relevant environment or runtime information
* Any suggested mitigation or remediation, if available

Please avoid including sensitive information that is not necessary to demonstrate the vulnerability.

## Response Process

We aim to acknowledge valid security reports within **72 hours**.

After initial investigation, we aim to provide the reporter with an update or an expected remediation timeline within **7 days**, where practical.

Response and remediation times may vary depending on:

* The severity of the vulnerability
* The complexity of the affected component
* The availability of a safe fix
* Required testing
* Potential ecosystem impact

Critical vulnerabilities may be prioritized for immediate investigation and remediation.

These response targets are goals rather than guaranteed service-level commitments.

## Security Scope

Ranu.js is responsible for security boundaries controlled by the framework.

Current security areas include, but are not limited to:

* Server secrets unintentionally entering browser bundles
* Server-only code executing in browser environments
* Arbitrary filesystem access through URLs or routing behavior
* Cross-request state leakage
* Production stack traces or sensitive diagnostic information being exposed by default

As the framework develops, additional security boundaries may be added to this policy when they become part of the public Ranu.js architecture.

## Pre-Alpha Security Notice

Ranu.js is currently under active development and has **not reached production stability**.

During the pre-alpha period:

* APIs may change without notice
* Security boundaries may evolve
* Packages may be reorganized
* Features may be incomplete
* Security behavior may change as implementation progresses

Ranu.js should therefore **not currently be used for production applications or security-critical workloads**.

Security issues discovered during development are still taken seriously and should be reported through the private reporting process described above.

## Coordinated Disclosure

Ranu.js follows a coordinated vulnerability disclosure approach.

We ask security researchers and reporters to:

1. Give the maintainers reasonable time to investigate and remediate the issue before public disclosure.
2. Avoid exploiting a vulnerability beyond what is reasonably necessary to verify its existence and impact.
3. Do not access, modify, destroy, or retain data that does not belong to you.
4. Avoid actions that could disrupt Ranu.js infrastructure, users, contributors, or third-party services.
5. Keep vulnerability details private while remediation is actively being coordinated.

Once an issue has been resolved, disclosure may be coordinated with the reporter where appropriate.

## Security Advisories

When appropriate, confirmed vulnerabilities may be documented through GitHub Security Advisories.

Security advisories may include:

* A description of the vulnerability
* Affected versions or revisions
* Severity information
* Available mitigations
* Fixed versions
* Upgrade guidance
* Reporter acknowledgement

## Researcher Credit

We appreciate responsible security research.

Where appropriate, reporters of confirmed vulnerabilities may be credited in the corresponding security advisory or release notes.

Reporters may request to remain anonymous.

## Future Updates

This security policy will evolve alongside Ranu.js.

As the project approaches public releases, the policy may be expanded to include:

* Version-specific security support periods
* Dedicated security contact information
* Release security procedures
* Dependency vulnerability management
* Additional disclosure guidance

For general project information, see [`README.md`](./README.md).

For development progress, see [`ROADMAP.md`](./ROADMAP.md).

---

**Ranu.js — Security Policy**
*Pre-alpha development*
