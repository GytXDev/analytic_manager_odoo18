/** @odoo-module **/
/** @odoo-module **/
import { registry } from '@web/core/registry';
import { Component, onMounted, useState } from "@odoo/owl";
import { rpc } from "@web/core/network/rpc";

export class AnalyticDashboard extends Component {
    static template = 'owl.AnalyticDashboard';

    state = useState({
        projetsTermines: [],
        projetsEnCours: [],
        resultatChantierTotal: 0,
        progressionMoyenne: 0,
        statistiquesProjets: {}
    });

    setup() {
        onMounted(async () => {
            await this.loadResultatChantierTotal();
            await this.loadProgressionMoyenne();
            await this.loadStatistiquesProjets();
            await this.loadProjets();
        });
    }

    async loadResultatChantierTotal() {
        try {
            const result = await rpc('/dashboard/resultat_chantier_total', {});
            this.state.resultatChantierTotal = result;
            console.log("Résultat chantier total:", result);
        } catch (error) {
            console.error("Erreur lors de la récupération du résultat chantier total :", error);
        }
    }

    async loadProgressionMoyenne() {
        try {
            const result = await rpc('/dashboard/progression_moyenne', {});
            this.state.progressionMoyenne = result;
            console.log("Progression moyenne:", result);
        } catch (error) {
            console.error("Erreur lors de la récupération de la progression moyenne :", error);
        }
    }

    async loadStatistiquesProjets() {
        try {
            const result = await rpc('/dashboard/statistiques_projets', {});
            this.state.statistiquesProjets = result;
            console.log("Statistiques des projets:", result);
        } catch (error) {
            console.error("Erreur lors de la récupération des statistiques des projets :", error);
        }
    }

    async loadProjets() {
        try {
            const allProjets = await rpc('/dashboard/liste_projets', {});

            if (Array.isArray(allProjets)) {
                // Séparer les projets en cours et terminés (optionnel si tu veux les afficher séparément)
                this.state.projetsEnCours = allProjets.filter(projet => projet.pourcentage_avancement < 1);
                this.state.projetsTermines = allProjets.filter(projet => projet.pourcentage_avancement >= 1);

                console.log("Projets en cours:", this.state.projetsEnCours);
                console.log("Projets terminés:", this.state.projetsTermines);

                // Dynamiser le tableau des projets
                const tableBody = document.getElementById('projects-table-body');
                tableBody.innerHTML = '';  // Vider le tableau existant

                allProjets.forEach(projet => {
                    const row = document.createElement('tr');
                    
                    // Code Projet
                    const codeProjetCell = document.createElement('td');
                    const codeProjetText = document.createElement('h6');
                    codeProjetText.classList.add('text-sm');
                    codeProjetText.textContent = projet.code_projet;
                    codeProjetCell.appendChild(codeProjetText);
                    row.appendChild(codeProjetCell);
                    
                    // Budget (CFA)
                    const budgetCell = document.createElement('td');
                    budgetCell.classList.add('text-center');
                    budgetCell.textContent = projet.budget ? projet.budget.toLocaleString() : '0';
                    row.appendChild(budgetCell);
                    
                    // Avancement
                    const progressCell = document.createElement('td');
                    const progressWrapper = document.createElement('div');
                    progressWrapper.classList.add('progress-wrapper', 'w-75', 'mx-auto');
                    const progressBarContainer = document.createElement('div');
                    progressBarContainer.classList.add('progress');
                    const progressBar = document.createElement('div');
                    progressBar.classList.add('progress-bar', 'bg-gradient-info');
                    progressBar.style.width = `${projet.pourcentage_avancement * 100}%`;

                    progressBarContainer.appendChild(progressBar);
                    progressWrapper.appendChild(progressBarContainer);
                    
                    const progressText = document.createElement('small');
                    progressText.textContent = `${(projet.pourcentage_avancement * 100).toFixed(0)}%`;
                    progressWrapper.appendChild(progressText);

                    progressCell.appendChild(progressWrapper);
                    row.appendChild(progressCell);

                    // Ajouter la ligne au tableau
                    tableBody.appendChild(row);
                });
            } else {
                console.error("La réponse n'est pas un tableau :", allProjets);
            }
        } catch (error) {
            console.error("Erreur lors de la récupération des projets:", error);
        }
    }

}

registry.category('actions').add('dashboard_analytic', AnalyticDashboard);
