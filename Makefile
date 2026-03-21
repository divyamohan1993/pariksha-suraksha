# ParikshaSuraksha — One-Click Deploy / Destroy
# Usage:
#   make deploy ENV=prod REGION=asia-south1 PROJECT_ID=your-gcp-project
#   make destroy ENV=prod REGION=asia-south1 PROJECT_ID=your-gcp-project

ENV ?= prod
REGION ?= asia-south1
PROJECT_ID ?= pariksha-suraksha
DOMAIN ?= pariksha.dmj.one
CLUSTER_NAME = pariksha-$(ENV)
REGISTRY = gcr.io/$(PROJECT_ID)

# ─────────────────────────────────────────────────
# ONE-CLICK DEPLOY
# ─────────────────────────────────────────────────
.PHONY: deploy
deploy: infra build push k8s-auth fabric-setup helm-deploy
	@echo ""
	@echo "═══════════════════════════════════════════════════"
	@echo "  ParikshaSuraksha deployed successfully!"
	@echo "  URL: https://$(DOMAIN)"
	@echo "  Admin: https://$(DOMAIN)/admin"
	@echo "  Environment: $(ENV)"
	@echo "═══════════════════════════════════════════════════"

# ─────────────────────────────────────────────────
# ONE-CLICK DESTROY
# ─────────────────────────────────────────────────
.PHONY: destroy
destroy: helm-destroy fabric-teardown infra-destroy
	@echo ""
	@echo "═══════════════════════════════════════════════════"
	@echo "  All ParikshaSuraksha resources destroyed."
	@echo "═══════════════════════════════════════════════════"

# ─────────────────────────────────────────────────
# INFRASTRUCTURE (Terraform)
# ─────────────────────────────────────────────────
.PHONY: infra
infra:
	@echo ">>> Provisioning infrastructure with Terraform..."
	cd terraform && \
		terraform init -backend-config="bucket=$(PROJECT_ID)-tf-state" && \
		terraform plan -var-file=env/$(ENV).tfvars \
			-var="project_id=$(PROJECT_ID)" \
			-var="region=$(REGION)" \
			-var="environment=$(ENV)" \
			-var="domain=$(DOMAIN)" \
			-out=tfplan && \
		terraform apply -auto-approve tfplan
	@echo ">>> Infrastructure provisioned."

.PHONY: infra-destroy
infra-destroy:
	@echo ">>> Destroying infrastructure with Terraform..."
	cd terraform && \
		terraform destroy -auto-approve \
			-var-file=env/$(ENV).tfvars \
			-var="project_id=$(PROJECT_ID)" \
			-var="region=$(REGION)" \
			-var="environment=$(ENV)" \
			-var="domain=$(DOMAIN)"
	@echo ">>> Infrastructure destroyed."

# ─────────────────────────────────────────────────
# DOCKER BUILD (all services in parallel)
# ─────────────────────────────────────────────────
SERVICES = api-gateway question-service paper-generator crypto-lifecycle \
           exam-session-service collusion-engine blockchain-service \
           admin-dashboard candidate-portal

WORKERS = irt-calibrator matrix-solver collusion-detector tlp-generator score-equator

.PHONY: build
build: build-services build-workers build-chaincode

.PHONY: build-services
build-services:
	@echo ">>> Building service Docker images..."
	@for svc in $(SERVICES); do \
		echo "  Building $$svc..."; \
		docker build -t $(REGISTRY)/$$svc:$(ENV) \
			-f packages/$$svc/Dockerfile \
			packages/$$svc & \
	done; \
	wait
	@echo ">>> All service images built."

.PHONY: build-workers
build-workers:
	@echo ">>> Building worker Docker images..."
	@for worker in $(WORKERS); do \
		echo "  Building $$worker..."; \
		docker build -t $(REGISTRY)/$$worker:$(ENV) \
			-f workers/$$worker/Dockerfile \
			workers/$$worker & \
	done; \
	wait
	@echo ">>> All worker images built."

.PHONY: build-chaincode
build-chaincode:
	@echo ">>> Building chaincode Docker image..."
	docker build -t $(REGISTRY)/exam-audit-chaincode:$(ENV) \
		-f chaincode/exam-audit/Dockerfile \
		chaincode/exam-audit
	@echo ">>> Chaincode image built."

# ─────────────────────────────────────────────────
# DOCKER PUSH (all images)
# ─────────────────────────────────────────────────
.PHONY: push
push:
	@echo ">>> Pushing images to GCR..."
	@for svc in $(SERVICES); do \
		docker push $(REGISTRY)/$$svc:$(ENV) & \
	done; \
	for worker in $(WORKERS); do \
		docker push $(REGISTRY)/$$worker:$(ENV) & \
	done; \
	docker push $(REGISTRY)/exam-audit-chaincode:$(ENV) & \
	wait
	@echo ">>> All images pushed."

# ─────────────────────────────────────────────────
# KUBERNETES AUTH
# ─────────────────────────────────────────────────
.PHONY: k8s-auth
k8s-auth:
	@echo ">>> Configuring kubectl..."
	gcloud container clusters get-credentials $(CLUSTER_NAME) \
		--region $(REGION) \
		--project $(PROJECT_ID)
	@echo ">>> kubectl configured."

# ─────────────────────────────────────────────────
# HYPERLEDGER FABRIC SETUP
# ─────────────────────────────────────────────────
.PHONY: fabric-setup
fabric-setup:
	@echo ">>> Setting up Hyperledger Fabric..."
	bash terraform/scripts/fabric-setup.sh $(ENV) $(PROJECT_ID) $(REGION)
	@echo ">>> Fabric network ready."

.PHONY: fabric-teardown
fabric-teardown:
	@echo ">>> Tearing down Hyperledger Fabric..."
	bash terraform/scripts/fabric-teardown.sh $(ENV) || true
	@echo ">>> Fabric network removed."

# ─────────────────────────────────────────────────
# HELM DEPLOY
# ─────────────────────────────────────────────────
.PHONY: helm-deploy
helm-deploy:
	@echo ">>> Deploying with Helm..."
	helm upgrade --install pariksha-suraksha ./helm \
		-f helm/values.yaml \
		-f helm/values-$(ENV).yaml \
		--set global.image.registry=$(REGISTRY) \
		--set global.image.tag=$(ENV) \
		--set global.projectId=$(PROJECT_ID) \
		--set global.domain=$(DOMAIN) \
		--wait --timeout 15m
	@echo ">>> Helm deployment complete."

.PHONY: helm-destroy
helm-destroy:
	@echo ">>> Removing Helm release..."
	helm uninstall pariksha-suraksha || true
	@echo ">>> Helm release removed."

# ─────────────────────────────────────────────────
# DEVELOPMENT HELPERS
# ─────────────────────────────────────────────────
.PHONY: dev
dev:
	@echo ">>> Starting local development..."
	docker compose -f docker-compose.dev.yml up --build

.PHONY: test
test: test-services test-workers

.PHONY: test-services
test-services:
	@for svc in $(SERVICES); do \
		echo "  Testing $$svc..."; \
		cd packages/$$svc && npm test && cd ../.. ; \
	done

.PHONY: test-workers
test-workers:
	@for worker in $(WORKERS); do \
		echo "  Testing $$worker..."; \
		cd workers/$$worker && python -m pytest && cd ../.. ; \
	done

.PHONY: lint
lint:
	@for svc in $(SERVICES); do \
		cd packages/$$svc && npm run lint && cd ../.. ; \
	done

.PHONY: clean
clean:
	@for svc in $(SERVICES); do \
		rm -rf packages/$$svc/node_modules packages/$$svc/dist ; \
	done
	@for worker in $(WORKERS); do \
		rm -rf workers/$$worker/__pycache__ workers/$$worker/.pytest_cache ; \
	done

# ─────────────────────────────────────────────────
# STATUS
# ─────────────────────────────────────────────────
.PHONY: status
status:
	@echo ">>> Cluster status:"
	kubectl get nodes
	@echo ""
	@echo ">>> Pod status:"
	kubectl get pods --all-namespaces -l app.kubernetes.io/part-of=pariksha-suraksha
	@echo ""
	@echo ">>> Services:"
	kubectl get svc --all-namespaces -l app.kubernetes.io/part-of=pariksha-suraksha
	@echo ""
	@echo ">>> Ingress:"
	kubectl get ingress --all-namespaces

.PHONY: logs
logs:
	@echo "Usage: make logs SVC=api-gateway"
	kubectl logs -l app.kubernetes.io/name=$(SVC) --tail=100 -f
