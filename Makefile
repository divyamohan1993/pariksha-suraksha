# ParikshaSuraksha — One-Click Deploy / Destroy
#
# Usage:
#   make deploy                                    # Deploy (creates Gemini key automatically)
#   make deploy GEMINI_API_KEY=your-key            # Deploy with existing key
#   make destroy                                   # Delete VM and all resources
#   make status                                    # Check if site is up
#   make ssh                                       # SSH into the VM
#   make logs                                      # View service logs

PROJECT_ID ?= lmsforshantithakur
REGION ?= asia-south1
ZONE ?= asia-south1-a
GEMINI_API_KEY ?=

.PHONY: deploy destroy status ssh logs gemini-key

gemini-key:
ifndef GEMINI_API_KEY
	$(eval GEMINI_API_KEY := $(shell gcloud services api-keys create \
		--display-name="pariksha-gemini" \
		--project=$(PROJECT_ID) \
		--format="value(keyString)" 2>/dev/null || echo ""))
	@if [ -z "$(GEMINI_API_KEY)" ]; then \
		echo "WARNING: Could not create Gemini API key. Question generation will be disabled."; \
	else \
		echo ">>> Gemini API key created."; \
	fi
endif

deploy: gemini-key
	@echo ">>> Deploying ParikshaSuraksha..."
	@echo ">>> Gemini API key: $(if $(GEMINI_API_KEY),SET,NOT SET — question generation disabled)"
	cd deploy && terraform init -input=false && \
		terraform apply -auto-approve \
			-var="project_id=$(PROJECT_ID)" \
			-var="region=$(REGION)" \
			-var="zone=$(ZONE)" \
			-var="gemini_api_key=$(GEMINI_API_KEY)"
	@echo ""
	@echo ">>> VM created. Services starting (takes ~3-5 minutes for npm install)."
	@echo ">>> Run 'make status' to check when ready."

destroy:
	@echo ">>> Destroying ParikshaSuraksha..."
	cd deploy && terraform destroy -auto-approve \
		-var="project_id=$(PROJECT_ID)" \
		-var="region=$(REGION)" \
		-var="zone=$(ZONE)" \
		-var="gemini_api_key="
	@echo ">>> All resources destroyed."

status:
	@IP=$$(cd deploy && terraform output -raw ip 2>/dev/null) && \
	echo "VM IP: $$IP" && \
	echo "Landing:  $$(curl -s -o /dev/null -w '%{http_code}' http://$$IP/)" && \
	echo "About:    $$(curl -s -o /dev/null -w '%{http_code}' http://$$IP/about)" && \
	echo "Pitch:    $$(curl -s -o /dev/null -w '%{http_code}' http://$$IP/pitch)" && \
	echo "Admin:    $$(curl -s -o /dev/null -w '%{http_code}' http://$$IP/admin/dashboard)" && \
	echo "API:      $$(curl -s -o /dev/null -w '%{http_code}' http://$$IP/api/v1/health)" && \
	echo "" && \
	echo "URL: http://$$IP"

ssh:
	gcloud compute ssh pariksha-vm --zone=$(ZONE) --project=$(PROJECT_ID)

logs:
	gcloud compute ssh pariksha-vm --zone=$(ZONE) --project=$(PROJECT_ID) \
		--command="journalctl -u pariksha-api -u pariksha-portal -u pariksha-admin --no-pager -n 50"
