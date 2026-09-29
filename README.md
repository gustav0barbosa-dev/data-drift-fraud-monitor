# Data Drift Fraud Monitor

Plataforma experimental para monitoramento de Data Drift em modelos de detecção de fraudes financeiras.

## 📋 Sobre o Projeto

Este projeto implementa uma plataforma que simula o ambiente de um banco ou fintech, integrando:

- Modelo de Machine Learning para detecção de fraudes
- Simulador de passagem do tempo com diferentes níveis de Data Drift
- Sistema de detecção de drift com múltiplos métodos estatísticos
- Dashboard de monitoramento para visualização e alertas
- Mecanismo de retreinamento orientado por alertas

## 🏗️ Arquitetura

[Inserir diagrama da arquitetura]

## 🚀 Como Executar

### Pré-requisitos

- Docker e Docker Compose
- Python 3.11+
- Node.js 18+

### Passos

1. Clone o repositório:
```bash
git clone https://github.com/seu-usuario/data-drift-fraud-monitor.git
cd data-drift-fraud-monitor


Execute com Docker Compose:

bash
docker-compose up --build
Acesse:

Frontend: http://localhost:3000

API: http://localhost:8000/docs

📁 Estrutura do Projeto
[Inserir árvore de diretórios]

👥 Equipe
Nome	Responsabilidade
Felipe Cunha Siqueira	ML & Dados
Gabriel dos Santos Ribeiro	Drift & Estatística
Gustavo Henrique Barbosa da Silva	Software & Fullstack
📄 Licença
Este projeto é parte de uma pesquisa acadêmica.

text

---

## ✅ Próximos Passos

1. **Executar o script** de criação da estrutura
2. **Inicializar repositório Git:**
   ```bash
   git init
   git add .
   git commit -m "Initial commit: project structure"
Configurar ambiente virtual Python:

bash
cd backend
python -m venv venv
source venv/bin/activate  # Linux/macOS
# ou venv\Scripts\activate  # Windows
pip install -r requirements.txt
Instalar dependências do frontend:

bash
cd frontend
npm install
Subir containers:

bash
docker-compose up --build