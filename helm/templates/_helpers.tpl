{{/*
Expand the name of the chart.
*/}}
{{- define "pariksha.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "pariksha.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "pariksha.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "pariksha.labels" -}}
helm.sh/chart: {{ include "pariksha.chart" . }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: pariksha-suraksha
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}

{{/*
Selector labels for a specific component
Usage: {{ include "pariksha.selectorLabels" (dict "Release" .Release "component" "api-gateway") }}
*/}}
{{- define "pariksha.selectorLabels" -}}
app.kubernetes.io/name: {{ .component }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Component labels (common + selector)
Usage: {{ include "pariksha.componentLabels" (dict "Chart" .Chart "Release" .Release "component" "api-gateway") }}
*/}}
{{- define "pariksha.componentLabels" -}}
{{ include "pariksha.labels" . }}
{{ include "pariksha.selectorLabels" (dict "Release" .Release "component" .component) }}
{{- end }}

{{/*
Service account name for a component
Usage: {{ include "pariksha.serviceAccountName" (dict "Release" .Release "saName" .Values.apiGateway.serviceAccount.name) }}
*/}}
{{- define "pariksha.serviceAccountName" -}}
{{- printf "%s-%s" .Release.Name .saName | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Image reference helper
Usage: {{ include "pariksha.image" (dict "global" .Values.global "image" .Values.apiGateway.image) }}
*/}}
{{- define "pariksha.image" -}}
{{- printf "%s/%s:%s" .global.image.registry .image (.tag | default "latest") }}
{{- end }}

{{/*
Security context for non-root containers with read-only root filesystem
*/}}
{{- define "pariksha.securityContext" -}}
runAsNonRoot: true
runAsUser: 1000
runAsGroup: 1000
fsGroup: 1000
{{- end }}

{{/*
Container security context
*/}}
{{- define "pariksha.containerSecurityContext" -}}
allowPrivilegeEscalation: false
readOnlyRootFilesystem: true
runAsNonRoot: true
runAsUser: 1000
capabilities:
  drop:
    - ALL
{{- end }}

{{/*
Pod anti-affinity for spreading across nodes
Usage: {{ include "pariksha.podAntiAffinity" "api-gateway" }}
*/}}
{{- define "pariksha.podAntiAffinity" -}}
affinity:
  podAntiAffinity:
    preferredDuringSchedulingIgnoredDuringExecution:
      - weight: 100
        podAffinityTerm:
          labelSelector:
            matchExpressions:
              - key: app.kubernetes.io/name
                operator: In
                values:
                  - {{ . }}
          topologyKey: kubernetes.io/hostname
{{- end }}
