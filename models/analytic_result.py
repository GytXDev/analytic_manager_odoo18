from odoo import models, fields, api

class AnalyticResult(models.Model):
    _name = 'analytic.result'
    _description = 'Résultats Analytique'

    # Classification
    exploitation = fields.Selection([
        ('libreville', 'LIBREVILLE'),
        ('moanda', 'MOANDA'),
        ('port_gentil', 'PORT-GENTIL'),
    ], string="Exploitation", required=True)
    mois = fields.Selection(
        [(str(i), f'{i:02d}') for i in range(1, 13)],
        string="Mois", required=True
    )
    annee = fields.Char("Année", required=True)

    # Champs principaux
    code_projet = fields.Char("Code Projet", required=True)
    libelle = fields.Char("Libellé", required=True)
    marche_initial = fields.Float("Marché Initial", required=True)
    travaux_supplementaires = fields.Float("TS (Travaux Supplémentaires)", default=0.0)
    fact_compta_cumulee = fields.Float("Fact Comptabilité Cumulée", required=True)
    od_facture = fields.Float("OD Facture", default=0.0)
    non_facture = fields.Float("Non Facturé", required=True)
    trop_facture = fields.Float("Trop Facturé", default=0.0)

    # Champs calculés
    activite_cumulee = fields.Float("Activité Cumulée", compute="_compute_activite_cumulee", store=True)
    pourcentage_avancement = fields.Float("% Avct", compute="_compute_pourcentage_avancement", store=True)
    deb_compta_cumulees = fields.Float("DEB COMPTA CUMULEES", default=0.0)
    total_debourses = fields.Float("Total Déboursés", compute="_compute_total_debourses", store=True)
    resultat_chantier_cumule = fields.Float("Résultat Chantier Cumulé", compute="_compute_resultat_chantier_cumule", store=True)

    @api.depends('marche_initial', 'travaux_supplementaires', 'fact_compta_cumulee', 'od_facture', 'non_facture', 'trop_facture')
    def _compute_activite_cumulee(self):
        for record in self:
            record.activite_cumulee = (
                record.marche_initial +
                record.travaux_supplementaires +
                record.fact_compta_cumulee +
                record.od_facture +
                record.non_facture
            )

    @api.depends('activite_cumulee', 'marche_initial')
    def _compute_pourcentage_avancement(self):
        for record in self:
            if record.marche_initial:
                record.pourcentage_avancement = (record.activite_cumulee / record.marche_initial) * 100
            else:
                record.pourcentage_avancement = 0.0

    @api.depends('activite_cumulee', 'deb_compta_cumulees')
    def _compute_total_debourses(self):
        for record in self:
            record.total_debourses = record.activite_cumulee + record.deb_compta_cumulees

    @api.depends('activite_cumulee', 'total_debourses')
    def _compute_resultat_chantier_cumule(self):
        for record in self:
            record.resultat_chantier_cumule = record.activite_cumulee - record.total_debourses
