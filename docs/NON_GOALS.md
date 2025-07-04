# Unimplemented Features

This document tracks features that are intentionally left out of the Outliner project. The table references the feature IDs defined in the YAML specifications.

## Security

### SEC-0002 Two-Factor Authentication (2FA)

Firebase Authentication is used for sign-in. Two-factor authentication is outside the scope of this project and will not be implemented.

## Notifications

### NOT-0001 External Notification Services

Outliner does not send notifications through Slack or any other external applications.

## Offline Editing

### OFF-NON Offline Editing Support

Offline editing will not be implemented. The Fluid Framework used for collaboration requires a network connection and does not support offline operations.

## Extensibility

### EXT-NON Plugin Architecture

Outliner does not provide a plugin system or extension API. Loading or executing user-defined plugins is outside the project's scope.
