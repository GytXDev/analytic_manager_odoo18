/** @odoo-module **/

import { registry } from '@web/core/registry';
import { Component, onMounted, useState } from "@odoo/owl";
import { rpc } from "@web/core/network/rpc";
import { useService } from "@web/core/utils/hooks";

export class AnalyticDashboard extends Component {
    static template = 'owl.AnalyticDashboard';

    state = useState({
        projetsTerminesCount: 0,
        projetsEnCoursCount: 0,
        resultatChantierTotal: 0,
        progressionMoyenne: 0,
        statistiquesProjets: {},
        projetsData: [],
        projetsEnCours: [],
        projetsTermines: []
    });

    setup() {
        this.action = useService("action");

        onMounted(async () => {
            await this.loadProjets();
            this.generateChart();
        });
    }


    async loadProjets() {
        try {
            const allProjets = await rpc('/dashboard/liste_projets', {});
            if (Array.isArray(allProjets)) {
                this.state.projetsEnCours = allProjets.filter(projet => projet.pourcentage_avancement < 1);
                this.state.projetsTermines = allProjets.filter(projet => projet.pourcentage_avancement >= 1);

                this.state.projetsTerminesCount = this.state.projetsTermines.length;
                this.state.projetsEnCoursCount = this.state.projetsEnCours.length;

                this.state.projetsData = allProjets.map(projet => ({
                    code: projet.code_projet,
                    resultChantier: projet.resultat_chantier_cumule || 0,
                }));

                console.log("Projets en cours:", this.state.projetsEnCours);
                console.log("Projets terminés:", this.state.projetsTermines);

                // Dynamiser le tableau des projets
                const tableBody = document.getElementById('projects-table-body');
                tableBody.innerHTML = ''; // Vider le tableau existant

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
                    budgetCell.textContent = projet.ca_final ? projet.ca_final.toLocaleString() : '0';
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

                    tableBody.appendChild(row);
                });
            } else {
                console.error("La réponse n'est pas un tableau :", allProjets);
            }
        } catch (error) {
            console.error("Erreur lors de la récupération des projets:", error);
        }
    }

    // Méthode pour naviguer vers un projet spécifique
    navigateToProjet(projetCode) {
        this.action.doAction({
            type: 'ir.actions.act_window',
            name: `Détails du projet ${projetCode}`,
            res_model: 'projet',
            views: [[false, 'form']],
            target: 'current',
            domain: [['code_projet', '=', projetCode]],
        });
    }
}

registry.category('actions').add('dashboard_analytic', AnalyticDashboard);
