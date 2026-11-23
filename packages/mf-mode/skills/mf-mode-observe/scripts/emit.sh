#!/usr/bin/env bash
# Append one event to an mf-mode-observe trace: one JSON object per line.
# Usage: emit.sh <trace> <kind> <summary> [--actor A] [--span S] [--status ok|fail|skip]
#                [--ref R]... [--calls N] [--secs N] [--note T] [--attr k=v]... [--ts ISO]
# It never blocks the run: it always exits 0, and a problem is one line on stderr.
# One printf per event, appended with >>, so concurrent writers keep whole lines.
set -u

warn() { printf 'emit.sh: %s\n' "$*" >&2; }

if [ "$#" -lt 3 ]; then
	warn 'usage: emit.sh <trace> <kind> <summary> [--actor A] [--span S] [--status ok|fail|skip] [--ref R]... [--calls N] [--secs N] [--note T] [--attr k=v]... [--ts ISO]'
	exit 0
fi

trace=$1
kind=$2
summary=$3
shift 3

if [ -z "$trace" ]; then
	warn 'empty trace path, event dropped'
	exit 0
fi

bs='\'
dq='"'
nl=$'\n'
cr=$'\r'
tab=$'\t'

# Sets REPLY to $1 as a JSON string literal, cut to $2 characters.
quote() {
	local s=${1:0:$2}
	s=${s//"$bs"/"$bs$bs"}
	s=${s//"$dq"/"$bs$dq"}
	s=${s//"$nl"/"${bs}n"}
	s=${s//"$cr"/"${bs}r"}
	s=${s//"$tab"/"${bs}t"}
	s=${s//[[:cntrl:]]/}
	REPLY="$dq$s$dq"
}

number() {
	case $1 in
	'' | *[!0-9.]* | *.*.* | .* | *.) return 1 ;;
	esac
	return 0
}

case $kind in
run.start | run.end | phase.start | phase.end | worker.start | worker.end | ci.start | ci.end | check | friction | decision | link | todo | note) ;;
*) warn "unknown kind '$kind', appended anyway" ;;
esac

actor=lead
span=
status=
calls=
secs=
note=
ts=
refs=
attrs=

while [ "$#" -gt 0 ]; do
	flag=$1
	if [ "$#" -lt 2 ]; then
		warn "$flag needs a value, ignored"
		break
	fi
	value=$2
	shift 2
	case $flag in
	--actor) [ -n "$value" ] && actor=$value ;;
	--span) span=$value ;;
	--status)
		case $value in
		ok | fail | skip) status=$value ;;
		*) warn "--status must be ok, fail or skip, got '$value', ignored" ;;
		esac
		;;
	--calls) if number "$value"; then calls=$value; else warn "--calls must be a number, got '$value', ignored"; fi ;;
	--secs) if number "$value"; then secs=$value; else warn "--secs must be a number, got '$value', ignored"; fi ;;
	--note) note=$value ;;
	--ts)
		case $value in
		[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]*) ts=$value ;;
		*) warn "--ts must be ISO-8601 UTC, got '$value', using now" ;;
		esac
		;;
	--ref)
		quote "$value" 200
		refs="$refs${refs:+,}$REPLY"
		;;
	--attr)
		key=${value%%=*}
		case $key in
		'' | *[!A-Za-z0-9_.-]*) warn "--attr needs key=value with a plain key, got '$value', ignored" ;;
		*)
			if [ "$key" = "$value" ]; then
				warn "--attr needs key=value, got '$value', ignored"
			else
				quote "${value#*=}" 200
				attrs="$attrs${attrs:+,}$dq$key$dq:$REPLY"
			fi
			;;
		esac
		;;
	*) warn "unknown flag '$flag', ignored" ;;
	esac
done

[ -n "$ts" ] || ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)

quote "$ts" 40
line="{\"v\":1,\"ts\":$REPLY"
quote "$actor" 80
line="$line,\"actor\":$REPLY"
quote "$kind" 40
line="$line,\"kind\":$REPLY"
quote "$summary" 400
line="$line,\"summary\":$REPLY"
if [ -n "$span" ]; then
	quote "$span" 120
	line="$line,\"span\":$REPLY"
fi
[ -n "$status" ] && line="$line,\"status\":\"$status\""
[ -n "$calls" ] && line="$line,\"calls\":$calls"
[ -n "$secs" ] && line="$line,\"secs\":$secs"
if [ -n "$note" ]; then
	quote "$note" 800
	line="$line,\"note\":$REPLY"
fi
[ -n "$refs" ] && line="$line,\"refs\":[$refs]"
[ -n "$attrs" ] && line="$line,\"attrs\":{$attrs}"
line="$line}"

dir=${trace%/*}
if [ "$dir" != "$trace" ] && [ -n "$dir" ] && [ ! -d "$dir" ]; then
	mkdir -p "$dir" 2>/dev/null
fi
if ! printf '%s\n' "$line" 2>/dev/null >>"$trace"; then
	warn "could not append to $trace, event dropped"
fi
exit 0
