"""Bounded in-memory diagnostics: timings/counts only, never user text or secrets."""
from contextlib import contextmanager
from contextvars import ContextVar
import re
import threading
import time

_current = ContextVar('ketime_assistant_trace', default=None)
_lock = threading.Lock()
_records = {}
STAGES = {'checking', 'models', 'requesting', 'waiting_output', 'receiving', 'validating', 'complete', 'failed'}
TIMINGS = {'catalogMs', 'headersMs', 'firstTextMs', 'inferenceMs', 'validationMs'}


class Trace:
    def __init__(self):
        self.started = time.monotonic()
        self.inference_started = None
        self.finished = None
        self.stage = 'checking'
        self.timings = {}
        self.cache_hit = None
        self.usage = {}
        self.lock = threading.Lock()

    def phase(self, stage):
        if stage in STAGES:
            with self.lock:
                self.stage = stage

    def metric(self, name, value):
        if name in TIMINGS and isinstance(value, (float, int)) and value >= 0:
            with self.lock:
                self.timings[name] = round(value, 1)

    def first_text(self):
        with self.lock:
            if self.inference_started is not None and 'firstTextMs' not in self.timings:
                self.timings['firstTextMs'] = round((time.monotonic() - self.inference_started) * 1000, 1)
            self.stage = 'receiving'

    def tokens(self, response):
        usage = response.get('usage', {}) if isinstance(response, dict) else {}
        if not isinstance(usage, dict):
            return
        values = {'inputTokens': usage.get('input_tokens'), 'outputTokens': usage.get('output_tokens')}
        details = usage.get('output_tokens_details', {})
        if isinstance(details, dict):
            values['reasoningTokens'] = details.get('reasoning_tokens')
        with self.lock:
            self.usage = {k: v for k, v in values.items() if type(v) is int and 0 <= v <= 10000000}

    @contextmanager
    def measure(self, name):
        start = time.monotonic()
        try:
            yield
        finally:
            self.metric(name, (time.monotonic() - start) * 1000)

    def finish(self, success):
        with self.lock:
            self.finished = time.monotonic()
            self.stage = 'complete' if success else 'failed'
        return self.snapshot()

    def snapshot(self):
        with self.lock:
            return {'stage': self.stage, 'elapsedMs': round(((self.finished or time.monotonic()) - self.started) * 1000, 1),
                    'timings': dict(self.timings), 'catalogCacheHit': self.cache_hit, 'usage': dict(self.usage)}


def current():
    return _current.get()


def identifier(value):
    return isinstance(value, str) and re.fullmatch(r'[a-f0-9]{32}', value) is not None


@contextmanager
def session(request_id=None):
    trace = Trace()
    if request_id is not None:
        if not identifier(request_id):
            raise ValueError('Invalid diagnostic request ID')
        with _lock:
            now = time.monotonic()
            for key, row in list(_records.items()):
                if now - row.started > 600:
                    del _records[key]
            if request_id in _records:
                raise ValueError('Diagnostic request ID already used')
            if len(_records) >= 32:
                completed = next((key for key, row in _records.items() if row.finished is not None), None)
                if completed is None:
                    raise ValueError('Diagnostic slots busy')
                del _records[completed]
            _records[request_id] = trace
    token = _current.set(trace)
    try:
        yield trace
    except BaseException:
        trace.finish(False)
        raise
    finally:
        _current.reset(token)


def progress(request_id):
    if not identifier(request_id):
        raise ValueError('Invalid diagnostic request ID')
    with _lock:
        trace = _records.get(request_id)
        if trace is None or time.monotonic() - trace.started > 600:
            return {'found': False}
        return {'found': True, **trace.snapshot()}
