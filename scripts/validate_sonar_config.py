"""Validate repository scan inputs; optionally compare server profile backups.

Uses only the Python standard library. Does not modify the SonarQube server.
"""

import argparse
from collections import Counter
import json
import os
from pathlib import Path
import re
import sys
from urllib.parse import urlencode
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET


LANGUAGES = {
    '.java': 'java', '.py': 'py', '.ts': 'ts', '.tsx': 'ts',
    '.js': 'js', '.mjs': 'js', '.cjs': 'js', '.jsx': 'js',
    '.html': 'web', '.css': 'css', '.scss': 'css', '.less': 'css', '.xml': 'xml',
}


def read_properties(path):
    text = re.sub(r'\\\r?\n\s*', '', path.read_text(encoding='utf-8'))
    return dict(line.strip().split('=', 1) for line in text.splitlines()
                if line.strip() and not line.lstrip().startswith(('#', '!')))


def matches(path, patterns):
    for pattern in patterns:
        regex = re.escape(pattern).replace(r'\*\*/', '(?:.*/)?')
        regex = regex.replace(r'\*\*', '.*').replace(r'\*', '[^/]*').replace(r'\?', '[^/]')
        if re.fullmatch(regex, path):
            return True
    return False


def profile_rules(profile):
    """Compare rule keys, severities, parameters and impacts independent of order."""
    if profile.tag != 'profile' or not profile.findtext('name') or not profile.findtext('language'):
        raise ValueError('Expected a SonarQube profile backup with name and language')
    rules = {}
    for rule in profile.findall('rules/rule'):
        key = (rule.findtext('repositoryKey'), rule.findtext('key'))
        if not all(key) or key in rules:
            raise ValueError(f'Missing or duplicate rule key: {key}')
        parameters = tuple(sorted((p.findtext('key'), (p.findtext('value') or '').strip())
                                  for p in rule.findall('parameters/parameter')))
        impacts = tuple(sorted((p.findtext('softwareQuality'), p.findtext('severity'))
                               for p in rule.findall('impacts/impact')))
        rules[key] = (rule.findtext('priority'), parameters, impacts)
    if not rules:
        raise ValueError('Profile contains no active rules')
    return rules


def validate_java_inputs(root, props):
    for key in ('sonar.java.binaries', 'sonar.java.test.binaries',
                'sonar.java.libraries', 'sonar.java.test.libraries'):
        entries = [p.strip() for p in props.get(key, '').split(',') if p.strip()]
        if not entries:
            raise ValueError(f'Missing required Java analysis property: {key}')
        for entry in entries:
            if key.endswith('binaries'):
                if not any((root / entry).rglob('*.class')):
                    raise ValueError(f'Missing compiled Java classes for {key}: {entry}')
            elif not any(path.is_file() for path in root.glob(entry)):
                raise ValueError(f'No dependency JARs for {key}: {entry}; run the Maven dependency copy step')


def validate_local(root, require_reports=False):
    props = read_properties(root / 'sonar-project.properties')
    split = lambda key: [p.strip() for p in props.get(key, '').split(',') if p.strip()]
    profiles = {}
    for path in sorted((root / 'sonarqube-config/quality-profiles').glob('*.xml')):
        profile = ET.parse(path).getroot()
        rules = profile_rules(profile)
        language = profile.findtext('language')
        if language in profiles:
            raise ValueError(f'Multiple profile exports for language {language}')
        profiles[language] = profile
        print(f'Profile {profile.findtext("name")}: {language}, {len(rules)} rules')

    counts = Counter()
    for scope in ('sonar.sources', 'sonar.tests'):
        if not split(scope):
            raise ValueError(f'{scope} is empty')
        for entry in split(scope):
            path = root / entry
            if not path.exists():
                raise ValueError(f'Missing {scope} path: {entry}')
            for file in ([path] if path.is_file() else path.rglob('*')):
                if not file.is_file():
                    continue
                relative = file.relative_to(root).as_posix()
                is_test = matches(relative, split('sonar.test.inclusions'))
                if scope == 'sonar.sources' and (is_test or matches(relative, split('sonar.exclusions'))):
                    continue
                if scope == 'sonar.tests' and (not is_test or matches(relative, split('sonar.test.exclusions'))):
                    continue
                language = 'docker' if file.name == 'Dockerfile' else LANGUAGES.get(file.suffix)
                if language:
                    counts[language] += 1
    missing = counts.keys() - profiles.keys()
    if missing:
        raise ValueError(f'Scanned languages without profile exports: {sorted(missing)}')
    unused = profiles.keys() - counts.keys()
    if unused:
        raise ValueError(f'Profile languages with no scanned files: {sorted(unused)}')
    print('Files by language (source and test): ' + ', '.join(f'{k}={v}' for k, v in sorted(counts.items())))

    if require_reports:
        validate_java_inputs(root, props)
        for key in ('sonar.coverage.jacoco.xmlReportPaths', 'sonar.python.coverage.reportPaths'):
            for entry in split(key):
                report = ET.parse(root / entry).getroot()
                expected = 'report' if 'jacoco' in key else 'coverage'
                if report.tag != expected:
                    raise ValueError(f'Invalid coverage report: {entry}')
                if expected == 'coverage':
                    sources = [Path(s.text) for s in report.findall('sources/source') if s.text]
                    for item in report.findall('.//class'):
                        filename = item.get('filename', '')
                        if not filename or not any((root / source / filename).is_file() for source in sources):
                            raise ValueError(f'Unresolvable Python coverage source: {filename}')
        for entry in split('sonar.javascript.lcov.reportPaths'):
            files = [line[3:] for line in (root / entry).read_text(encoding='utf-8').splitlines()
                     if line.startswith('SF:')]
            if not files or any(not (root / file).is_file() for file in files):
                raise ValueError(f'Empty or unresolvable LCOV report: {entry}; run prepare_sonar_coverage.py')
        print('Compiled Java source/test classes, dependency JARs, and coverage reports validated.')
    return props, profiles


def check_server(props, profiles, server_url=None):
    base = (server_url or props['sonar.host.url']).rstrip('/')
    token = os.environ.get('SONAR_TOKEN') or os.environ.get('SONAR_AUTH_TOKEN')

    def get(endpoint, **params):
        url = base + '/api/' + endpoint + ('?' + urlencode(params) if params else '')
        headers = {'Authorization': f'Bearer {token}'} if token else {}
        with urlopen(Request(url, headers=headers), timeout=15) as response:
            return response.read()

    status = json.loads(get('system/status'))
    if status.get('status') != 'UP':
        raise ValueError(f'SonarQube is not ready: {status.get("status")}')
    print(f'Server is UP: {base}, version {status.get("version")}')
    assigned = json.loads(get('qualityprofiles/search', project=props['sonar.projectKey']))['profiles']
    by_language = {profile['language']: profile for profile in assigned}
    for language, local in profiles.items():
        expected = local.findtext('name')
        actual = by_language.get(language, {}).get('name')
        if actual != expected:
            raise ValueError(f'{language}: project uses {actual!r}; expected {expected!r}')
        backup = ET.fromstring(get('qualityprofiles/backup', language=language, qualityProfile=expected))
        if profile_rules(backup) != profile_rules(local):
            raise ValueError(f'{language}: server rules differ from the committed profile export')
        print(f'Server profile matches export: {expected}')
    gate = json.loads(get('qualitygates/get_by_project', project=props['sonar.projectKey']))
    print('Assigned quality gate: ' + gate['qualityGate']['name'] + ' (thresholds not verified)')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--require-reports', action='store_true', help='Require bytecode and resolvable coverage reports')
    parser.add_argument('--check-server', action='store_true', help='Read server status and compare assigned profile exports')
    parser.add_argument('--server-url', help='Override the configured URL for --check-server')
    args = parser.parse_args()
    if args.server_url and not args.check_server:
        parser.error('--server-url requires --check-server')
    try:
        props, profiles = validate_local(Path(__file__).resolve().parent.parent, args.require_reports)
        if args.check_server:
            check_server(props, profiles, args.server_url)
        print('Requested checks passed.' if args.check_server else 'Local checks passed; server assignments and scan execution not verified.')
    except (ValueError, OSError, ET.ParseError, KeyError) as error:
        print(f'ERROR: {error}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
