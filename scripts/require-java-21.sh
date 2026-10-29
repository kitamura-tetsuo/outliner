#!/bin/bash
set -euo pipefail

if ! command -v java >/dev/null 2>&1; then
  echo "Error: Firebase emulators require Java 21 or newer, but java was not found." >&2
  echo "Use the repository devcontainer or install a maintained Java 21+ distribution and set JAVA_HOME/PATH." >&2
  exit 1
fi

java_version_output="$(java -version 2>&1)" || {
  echo "Error: unable to execute java while checking the Firebase emulator prerequisite." >&2
  exit 1
}
java_major="$(printf '%s\n' "$java_version_output" | sed -nE 's/.*version "([0-9]+)(\.[^"]*)?".*/\1/p' | head -n 1)"

if [[ ! "$java_major" =~ ^[0-9]+$ ]]; then
  echo "Error: unable to determine the Java major version from: $(printf '%s\n' "$java_version_output" | head -n 1)" >&2
  echo "Firebase emulators require Java 21 or newer." >&2
  exit 1
fi

if (( java_major < 21 )); then
  echo "Error: Firebase emulators require Java 21 or newer; found Java ${java_major}." >&2
  echo "Use the repository devcontainer or install a maintained Java 21+ distribution and set JAVA_HOME/PATH." >&2
  exit 1
fi

echo "Java ${java_major} satisfies the Firebase emulator requirement (21+)."
