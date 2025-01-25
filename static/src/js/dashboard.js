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
            await this.loadResultatChantierTotal();
            await this.loadProgressionMoyenne();
            await this.loadStatistiquesProjets();
            await this.loadProjets();
            this.generateChart();
            this._eventListenersChart();
        });
    }


    _eventListenersChart() {
        // Style switcher
        document.querySelectorAll('.style-switcher-toggler').forEach(el => {
            el.addEventListener('click', () => {
                const styleSwitcher = document.querySelector('.style-switcher');
                if (styleSwitcher) {
                    styleSwitcher.classList.toggle('open');
                }
            });
        });

        // Sélecteur de période
        const chartSelection = document.querySelector('#chart-selection');
        if (chartSelection) {
        }
    }


    async loadResultatChantierTotal() {
        try {
            const result = await rpc('/dashboard/resultat_chantier_total', {});
            const total = result?.resultat_chantier_total || 0;
            this.state.resultatChantierTotal = total.toLocaleString();
            console.log("Résultat chantier total:", total);
        } catch (error) {
            console.error("Erreur lors de la récupération du résultat chantier total :", error);
        }
    }


    async loadProgressionMoyenne() {
        try {
            const result = await rpc('/dashboard/progression_moyenne', {});

            // Extraction de la valeur numérique depuis l'objet
            let progression = result?.progression_moyenne || 0; // Assurez-vous que 'progression_moyenne' est bien défini

            // Vérification de la validité de la progression
            if (typeof progression === 'number' && !isNaN(progression)) {
                this.state.progressionMoyenne = (progression * 100).toFixed(2); // En pourcentage
            } else {
                this.state.progressionMoyenne = '0.00'; // Valeur par défaut si progression invalide
                console.error("Progression moyenne invalide:", progression);
            }

            console.log("Progression moyenne:", progression);
        } catch (error) {
            console.error("Erreur lors de la récupération de la progression moyenne :", error);
            this.state.progressionMoyenne = '0.00'; // Valeur par défaut en cas d'erreur
        }
    }



    async loadStatistiquesProjets() {
        try {
            const result = await rpc('/dashboard/statistiques_projets', {});
            this.state.statistiquesProjets = result || {};
            console.log("Statistiques des projets:", result);
        } catch (error) {
            console.error("Erreur lors de la récupération des statistiques des projets :", error);
        }
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

                    // Ajout du gestionnaire de clic sur la ligne
                    row.addEventListener('click', () => {
                        this.navigateToProjet(projet.code_projet);
                    });

                    tableBody.appendChild(row);
                });

            } else {
                console.error("La réponse n'est pas un tableau :", allProjets);
            }
        } catch (error) {
            console.error("Erreur lors de la récupération des projets:", error);
        }
    }

    generateChart() {
        const ctx = document.getElementById('ResultatChart').getContext('2d');
        if (!this.state.projetsData || !this.state.projetsData.length) {
            console.error("Pas de données valides pour générer le graphique !");
            return;
        }

        const labels = this.state.projetsData.map(projet => projet.code);
        const data = this.state.projetsData.map(projet => projet.resultChantier);

        const backgroundColors = [
            '#42A5F5', '#66BB6A', '#FFA726', '#FF7043', '#8D6E63',
            '#AB47BC', '#26C6DA', '#FFEE58', '#D4E157', '#EC407A',
            '#7E57C2', '#5C6BC0', '#26A69A', '#8D6E63', '#78909C',
            '#FFCA28', '#29B6F6', '#EF5350', '#9CCC65', '#FF5722'
        ];

        new Chart(ctx, {
            type: 'pie',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Résultat Chantier (CFA)',
                    data: data,
                    backgroundColor: backgroundColors,
                }],
            },
            options: {
                responsive: true,
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                return `Resultat Chantier: ${context.raw.toLocaleString()} CFA`;
                            },
                        },
                    },
                    legend: {
                        position: 'top',
                    },
                },
            },
        });
    }

    // Méthode pour naviguer vers un projet spécifique
    navigateToProjet(projetCode) {
        this.action.doAction({
            type: 'ir.actions.act_window',
            name: `Détails du projet ${projetCode}`,
            res_model: 'analytic.dashboard',
            views: [[false, "list"], [false, "form"]],
            target: 'current',
            domain: [['name.code', '=', projetCode]],
        });
    }
}

registry.category('actions').add('dashboard_analytic', AnalyticDashboard);
